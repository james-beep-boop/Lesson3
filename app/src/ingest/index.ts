/**
 * Upload/import orchestration (SPEC §7): read ARES data files (`.js` modules OR `.json` exports) →
 * create a LessonPlan plus its version 1.0.0 (Official) via the Local API, in one all-or-nothing
 * transaction. The two input formats carry deep-equal data for a sub-strand, so only the
 * read step differs (`.json` → JSON.parse; `.js` → safe AST parse) — see `extract.ts`.
 *
 * ENTRY POINTS (both trusted, never teacher-facing): the dev-only CLI (`app/scripts/ingest.ts`)
 * and the Site-Administrator-only JSON upload endpoint (`src/endpoints/uploadBundles.ts`) — both
 * call the shared `ingestItems` core below. `ingestItems` runs as a TRUSTED Local-API system
 * call (no `req.user` → the version field-split treats it as a system path and lets it set all
 * fields), so **callers MUST enforce authorization first**: the CLI is dev-only; the endpoint
 * gates on Site Admin server-side (`isSiteAdmin`) and accepts JSON only. The untrusted-input risk
 * lives in `extract.ts` (parse-never-execute for `.js`; structural guards for `.json`); see its
 * security contract.
 *
 * Lifecycle: valid uploads create version 1.0.0 and immediately mark that exact snapshot
 * Official via the parent LessonPlan. Later edits create additional non-official snapshots;
 * Site Admins / matching Subject Admins move the official pointer when a later version is ready.
 *
 * SubjectGrade: resolved by EXACT (Subject.name, grade) match. Missing taxonomy is a hard,
 * actionable failure — ingest never auto-creates Subjects/SubjectGrades, keeping that
 * curated junction list clean (docs/DECISIONS.md). Seed taxonomy before ingesting.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { commitTransaction, initTransaction, killTransaction } from 'payload'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import { contractDrift } from './contract'
import { IngestError } from './errors'
import { extractAresData, extractAresJson } from './extract'
import { rawToBundle, type IngestBundleData } from './toBundle'
import { deliverableWarnings, validateGeneratable } from './validateGeneratable'
import { nextMajorForPlan } from '../lib/semver'
import { relId } from '../lib/relId'

/** A minimal Local-API request carrier (no user = trusted system path). */
type IngestReq = Partial<PayloadRequest> & { payload: Payload }
const LESSON_PLANS = 'lesson-plans' as CollectionSlug
const LESSON_BUNDLE_VERSIONS = 'lesson-bundle-versions' as CollectionSlug

export interface IngestResult {
  file: string
  id: number
  title: string
  subjectGrade: number
  semver: string
  official: boolean
  /** 'created' = new lesson plan at 1.0.0 Official; 'revised' = next-major version of an existing
   *  plan (SPEC §7 re-ingest), arriving Not Official for admin review. */
  action: 'created' | 'revised'
  /** Non-blocking deliverable warnings (e.g. missing FINAL_EXPLANATION / SUMMARY_TABLE). */
  warnings: string[]
}

/** The sub-strand identity within a subject-grade: `META.substrand_id`, trimmed ('' = absent). */
const substrandIdOf = (raw: Record<string, unknown>): string => {
  const meta = (raw.META ?? {}) as Record<string, unknown>
  return typeof meta.substrand_id === 'string' ? meta.substrand_id.trim() : ''
}

/**
 * Resolve the existing lesson plan a re-upload belongs to (SPEC §7). Identity is
 * `(subjectGrade, META.substrand_id)`: query the subject-grade's versions carrying that substrand_id
 * and fold to their distinct parent plans. Returns the plan id to attach to as the next MAJOR
 * version, or `null` for no match → create a NEW plan (1.0.0 Official). An empty substrand_id can't
 * be matched, so it is always treated as new. **>1 matching plan** (legacy duplicates from before
 * this feature) THROWS `IngestError` here — the caller has no other response to ambiguity than to
 * fail pre-flight, so owning the throw keeps the return a plain `number | null`.
 */
async function findExistingPlan(
  payload: Payload,
  subjectGrade: number,
  substrandId: string,
  req: IngestReq,
): Promise<number | null> {
  if (!substrandId) return null
  const { docs } = await payload.find({
    collection: LESSON_BUNDLE_VERSIONS,
    where: {
      and: [
        { subjectGrade: { equals: subjectGrade } },
        { 'meta.substrand_id': { equals: substrandId } },
      ],
    },
    depth: 0,
    pagination: false,
    select: { lessonPlan: true },
    req,
  })
  const planIds = [
    ...new Set(docs.map((d) => relId((d as { lessonPlan?: unknown }).lessonPlan)).filter((id): id is number => id != null)),
  ]
  if (planIds.length > 1) {
    throw new IngestError(
      `sub-strand ${JSON.stringify(substrandId)} matches ${planIds.length} existing lesson plans ` +
        `(#${planIds.join(', #')}) in this subject-grade — resolve the duplicate before re-ingesting.`,
    )
  }
  return planIds[0] ?? null
}

/** Resolve the required `subjectGrade` id from META.subject / META.grade (exact match). */
async function resolveSubjectGrade(
  payload: Payload,
  raw: Record<string, unknown>,
  req: IngestReq,
): Promise<number> {
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
  subjectGrade: number
  /** The sub-strand identity, for intra-batch duplicate detection. */
  substrandId: string
  /** Existing plan to attach to as the next major (SPEC §7 re-ingest), or null to create a new one. */
  existingPlanId: number | null
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
 *   2. WRITE: create all prepared lesson plans + 1.0.0 Official versions inside ONE transaction
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
  // Memoize taxonomy resolution across the batch: a directory of sub-strands is typically all one
  // subject-grade, so without this `resolveSubjectGrade` re-runs its 2 finds for every file.
  const sgCache = new Map<string, Promise<number>>()
  const resolveSubjectGradeCached = (raw: Record<string, unknown>): Promise<number> => {
    const meta = (raw.META ?? {}) as Record<string, unknown>
    const cacheKey = `${typeof meta.subject === 'string' ? meta.subject.trim() : ''}::${meta.grade}`
    let hit = sgCache.get(cacheKey)
    if (!hit) {
      hit = resolveSubjectGrade(payload, raw, preflightReq)
      sgCache.set(cacheKey, hit)
    }
    return hit
  }
  for (const { name, extract } of items) {
    try {
      const raw = extract()
      const data = rawToBundle(raw)
      const problems = validateGeneratable(data)
      if (problems.length > 0) {
        throw new IngestError(`not generatable:\n    - ${problems.join('\n    - ')}`)
      }
      // Contract drift is a HARD GATE: ARES adopted ares-contract.schema.json, so any divergence
      // is a regression that must block ingest (same all-or-nothing pre-flight as
      // validateGeneratable — nothing is written if ANY file drifts). Validate the RAW (UPPERCASE)
      // object, the shape the contract describes. See docs/DECISIONS.md (warn-only → hard gate).
      const drift = contractDrift(raw)
      if (drift.length > 0) {
        throw new IngestError(`contract drift:\n    - ${drift.join('\n    - ')}`)
      }
      const subjectGrade = await resolveSubjectGradeCached(raw)
      const substrandId = substrandIdOf(raw)
      // Re-ingest resolution (SPEC §7): the existing plan to attach to as a new major, or null to
      // create a new plan. >1 match (legacy duplicates) throws inside findExistingPlan.
      const existingPlanId = await findExistingPlan(payload, subjectGrade, substrandId, preflightReq)
      prepared.push({
        name,
        data,
        subjectGrade,
        substrandId,
        existingPlanId,
        warnings: deliverableWarnings(data),
      })
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Intra-batch duplicate guard (SPEC §7): two files targeting the SAME (subjectGrade, substrand_id)
  // in one upload would race for the plan/pointer — reject the batch instead. Only non-empty
  // substrand_ids are keyed (an empty one is always a distinct new plan, so it can't collide).
  const seen = new Map<string, string>()
  for (const p of prepared) {
    if (!p.substrandId) continue
    const key = `${p.subjectGrade}::${p.substrandId}`
    const prior = seen.get(key)
    if (prior) {
      errors.push(
        `${p.name}: duplicate of "${prior}" in this batch — both target sub-strand ` +
          `${JSON.stringify(p.substrandId)} in the same subject-grade. Upload one at a time.`,
      )
    } else {
      seen.set(key, p.name)
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
    for (const { name, data, subjectGrade, existingPlanId, warnings } of prepared) {
      if (existingPlanId != null) {
        // RE-INGEST (SPEC §7): attach as the next MAJOR version of the existing plan, arriving
        // Not Official. The Official pointer is NOT moved and the plan title is NOT refreshed — the
        // canonical (Official) content is unchanged until a Subject/Site Admin promotes this
        // candidate via Make Official (deliberate review gate, decided 2026-07-05). No sourceVersion
        // (this is an ingest, not a fork). nextMajorForPlan sees the plan's committed versions;
        // the unique (lessonPlan, semver) index is the backstop.
        const semver = await nextMajorForPlan(payload, existingPlanId, req)
        await payload.create({
          collection: LESSON_BUNDLE_VERSIONS,
          data: {
            ...data,
            lessonPlan: existingPlanId,
            subjectGrade,
            semver,
          } as never,
          req,
        })
        results.push({
          file: name,
          id: existingPlanId,
          title: data.title,
          subjectGrade,
          semver,
          official: false,
          action: 'revised',
          warnings,
        })
        continue
      }

      // NEW plan: version 1.0.0, made Official immediately (ingest order: plan → version → pointer).
      const plan = await payload.create({
        collection: LESSON_PLANS,
        data: {
          title: data.title,
          subjectGrade,
        } as never,
        req,
      })
      const version = await payload.create({
        collection: LESSON_BUNDLE_VERSIONS,
        data: {
          ...data,
          lessonPlan: plan.id,
          subjectGrade,
          semver: '1.0.0',
        } as never,
        req,
      })
      await payload.update({
        collection: LESSON_PLANS,
        id: plan.id,
        data: {
          officialVersion: version.id,
        } as never,
        req,
      })
      results.push({
        file: name,
        id: plan.id,
        title: data.title,
        subjectGrade,
        semver: '1.0.0',
        official: true,
        action: 'created',
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
