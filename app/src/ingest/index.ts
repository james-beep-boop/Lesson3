/**
 * Ingest orchestration (SPEC §7): read ARES data files (`.js` modules OR `.json` exports) →
 * create stored bundles as version 1.0.0 (DRAFT) via the Local API, in one all-or-nothing
 * transaction. The two input formats carry deep-equal data for a sub-strand, so only the
 * read step differs (`.json` → JSON.parse; `.js` → safe AST parse) — see `extract.ts`.
 *
 * ENTRY POINTS (both trusted, never teacher-facing): the dev-only CLI (`app/scripts/ingest.ts`)
 * and the Site-Administrator-only JSON upload endpoint (`src/endpoints/uploadBundles.ts`) — both
 * call the shared `ingestItems` core below. `ingestItems` runs as a TRUSTED Local-API system
 * call (no `req.user` → `enforceBundleStructure` treats it as a system path and lets it set all
 * fields), so **callers MUST enforce authorization first**: the CLI is dev-only; the endpoint
 * gates on Site Admin server-side (`isSiteAdmin`) and accepts JSON only. The untrusted-input risk
 * lives in `extract.ts` (parse-never-execute for `.js`; structural guards for `.json`); see its
 * security contract.
 *
 * Lifecycle: bundles are created as DRAFTS (`_status: 'draft'`). An administrator reviews
 * and publishes to make a bundle official / export-eligible (SPEC §6); publishing is
 * separately gated by `enforceGeneratable`. Export stays published-only.
 *
 * SubjectGrade: resolved by EXACT (Subject.name, grade) match. Missing taxonomy is a hard,
 * actionable failure — ingest never auto-creates Subjects/SubjectGrades, keeping that
 * curated junction list clean (docs/DECISIONS.md). Seed taxonomy before ingesting.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { commitTransaction, initTransaction, killTransaction } from 'payload'
import type { Payload, PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { contractDriftSummary } from './contract'
import { IngestError } from './errors'
import { extractAresData, extractAresJson } from './extract'
import { rawToBundle, type IngestBundleData } from './toBundle'
import { deliverableWarnings, validateGeneratable } from './validateGeneratable'

/** A minimal Local-API request carrier (no user = trusted system path). */
type IngestReq = Partial<PayloadRequest> & { payload: Payload }

export interface IngestResult {
  file: string
  id: string | number
  title: string
  subjectGrade: string | number
  semver: string
  status: string
  /** Non-blocking deliverable warnings (e.g. missing FINAL_EXPLANATION / SUMMARY_TABLE). */
  warnings: string[]
}

/** Resolve the required `subjectGrade` id from META.subject / META.grade (exact match). */
async function resolveSubjectGrade(
  payload: Payload,
  raw: Record<string, unknown>,
  req: IngestReq,
): Promise<string | number> {
  const meta = (raw.META ?? {}) as Record<string, unknown>
  const subjectName = typeof meta.subject === 'string' ? meta.subject.trim() : ''
  const grade = typeof meta.grade === 'number' ? meta.grade : null
  if (!subjectName || grade == null) {
    throw new IngestError(
      `META.subject / META.grade missing or invalid (subject=${JSON.stringify(meta.subject)}, grade=${JSON.stringify(meta.grade)}).`,
    )
  }

  const subjects = await payload.find({
    collection: 'subjects',
    where: { name: { equals: subjectName } },
    limit: 1,
    depth: 0,
    req,
  })
  const subject = subjects.docs[0]
  if (!subject) {
    const all = await payload.find({ collection: 'subjects', limit: 200, depth: 0, req })
    const names = all.docs.map((d) => `"${d.name}"`).join(', ') || '(none)'
    throw new IngestError(
      `No Subject named "${subjectName}". Existing subjects: ${names}. Create the Subject and its SubjectGrade before ingest.`,
    )
  }

  const sgs = await payload.find({
    collection: 'subject-grades',
    where: { and: [{ subject: { equals: subject.id } }, { grade: { equals: grade } }] },
    limit: 1,
    depth: 0,
    req,
  })
  const sg = sgs.docs[0]
  if (!sg) {
    throw new IngestError(
      `No SubjectGrade for "${subjectName}" Grade ${grade}. Create it (Taxonomy → Subject Grades) before ingest.`,
    )
  }
  return sg.id
}

/** A recognised ARES data file: a `.js` module or a `.json` export. */
const isDataFile = (f: string): boolean => f.endsWith('.js') || f.endsWith('.json')

/** Flat list of `.js`/`.json` data files for the given file/dir inputs (sorted, de-duped). */
function gatherDataFiles(inputPaths: string[]): string[] {
  const out = new Set<string>()
  for (const input of inputPaths) {
    const resolved = path.resolve(input)
    const st = statSync(resolved)
    if (st.isDirectory()) {
      for (const entry of readdirSync(resolved).sort()) {
        if (isDataFile(entry)) out.add(path.join(resolved, entry))
      }
    } else if (isDataFile(resolved)) {
      out.add(resolved)
    } else {
      throw new IngestError(`Not a .js/.json file or directory: ${input}`)
    }
  }
  return [...out]
}

/** Extract a data file's raw bundle: `.json` via JSON.parse, `.js` via the safe AST parse. */
const extractDataFile = (file: string, source: string): Record<string, unknown> =>
  file.endsWith('.json') ? extractAresJson(source) : extractAresData(source)

type Prepared = {
  name: string
  data: IngestBundleData
  subjectGrade: string | number
  warnings: string[]
}

/**
 * One ingest input: a named source plus a thunk that produces its raw bundle. `extract` is
 * a thunk (not an eagerly-parsed object) so a parse failure is caught and AGGREGATED in
 * pre-flight alongside validation/taxonomy problems, rather than aborting the whole batch on
 * the first bad file. The thunk also lets each caller choose the safe parser: the CLI picks
 * by extension (`.js` AST / `.json` JSON.parse); the upload endpoint always uses
 * `extractAresJson`. Neither path ever executes the input.
 */
export type IngestItem = { name: string; extract: () => Record<string, unknown> }

/**
 * Shared ingest core (used by the CLI `ingestPaths` and the Site-Admin upload endpoint).
 * Two phases:
 *   1. PRE-FLIGHT (read-only): extract + completeness-validate + resolve taxonomy for ALL
 *      items, collecting every problem. If any fails, throw with the full list, write NOTHING.
 *   2. WRITE: create all prepared bundles as 1.0.0 drafts inside ONE transaction
 *      (all-or-nothing — a failure rolls back the whole batch).
 *
 * This is a TRUSTED system path (no `req.user`): callers MUST enforce authorization before
 * calling it — the CLI is dev-only; the endpoint gates on Site Admin.
 */
export async function ingestItems(payload: Payload, items: IngestItem[]): Promise<IngestResult[]> {
  if (items.length === 0) {
    throw new IngestError('No bundles to ingest.')
  }

  // Phase 1 — pre-flight (read-only).
  const preflightReq: IngestReq = { payload }
  const prepared: Prepared[] = []
  const errors: string[] = []
  for (const { name, extract } of items) {
    try {
      const raw = extract()
      const data = rawToBundle(raw)
      const problems = validateGeneratable(data)
      if (problems.length > 0) {
        throw new IngestError(`not generatable:\n    - ${problems.join('\n    - ')}`)
      }
      const subjectGrade = await resolveSubjectGrade(payload, raw, preflightReq)
      // Contract drift is NON-BLOCKING (current ARES output doesn't conform yet — that's the
      // drift we report). Validate the RAW (UPPERCASE) object, the shape the contract describes.
      const drift = contractDriftSummary(raw)
      prepared.push({
        name,
        data,
        subjectGrade,
        warnings: [...deliverableWarnings(data), ...(drift ? [drift] : [])],
      })
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (errors.length > 0) {
    throw new IngestError(
      `Pre-flight failed (${errors.length}/${items.length} file(s)); nothing was written:\n  - ${errors.join('\n  - ')}`,
    )
  }

  // Phase 2 — write all bundles in one transaction.
  const req: IngestReq = { payload }
  await initTransaction(req)
  try {
    const results: IngestResult[] = []
    for (const { name, data, subjectGrade, warnings } of prepared) {
      const created = await payload.create({
        collection: 'lesson-bundles',
        data: { ...data, subjectGrade } as unknown as RequiredDataFromCollectionSlug<'lesson-bundles'>,
        draft: true,
        req,
      })
      results.push({
        file: name,
        id: created.id,
        title: created.title ?? data.title,
        subjectGrade,
        semver: created.semver ?? '1.0.0',
        status: created._status ?? 'draft',
        warnings,
      })
    }
    await commitTransaction(req)
    return results
  } catch (e) {
    await killTransaction(req)
    throw e
  }
}

/**
 * Ingest every `.js`/`.json` data file under the given file/dir paths (CLI entry point).
 * Thin wrapper over `ingestItems`: gathers files and hands each as an extract-thunk so a
 * parse error is aggregated in pre-flight like any other problem.
 */
export async function ingestPaths(payload: Payload, inputPaths: string[]): Promise<IngestResult[]> {
  const files = gatherDataFiles(inputPaths)
  if (files.length === 0) {
    throw new IngestError(`No .js/.json files found at: ${inputPaths.join(', ')}`)
  }
  return ingestItems(
    payload,
    files.map((file) => ({
      name: path.basename(file),
      extract: () => extractDataFile(file, readFileSync(file, 'utf8')),
    })),
  )
}
