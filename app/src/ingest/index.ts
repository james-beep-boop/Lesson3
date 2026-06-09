/**
 * Ingest orchestration (SPEC §7): extract ARES `.js` data modules → create stored bundles
 * as version 1.0.0 (DRAFT) via the Local API, in one all-or-nothing transaction.
 *
 * DEV-ONLY: ingest is run by the app developer or the lesson-plan author via the CLI
 * (`app/scripts/ingest.ts`), never by teachers and never via an HTTP/upload surface. It is
 * a TRUSTED Local-API system call (no `req.user` → `enforceBundleStructure` treats it as a
 * system path and lets it set all fields). The untrusted-input risk lives in `extract.ts`
 * (parse-never-execute); see that file's security contract.
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

import { IngestError } from './errors'
import { extractAresData } from './extract'
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

/** Recursively-free list of `.js` files for the given file/dir inputs (sorted, de-duped). */
function gatherJsFiles(inputPaths: string[]): string[] {
  const out = new Set<string>()
  for (const input of inputPaths) {
    const resolved = path.resolve(input)
    const st = statSync(resolved)
    if (st.isDirectory()) {
      for (const entry of readdirSync(resolved).sort()) {
        if (entry.endsWith('.js')) out.add(path.join(resolved, entry))
      }
    } else if (resolved.endsWith('.js')) {
      out.add(resolved)
    } else {
      throw new IngestError(`Not a .js file or directory: ${input}`)
    }
  }
  return [...out]
}

type Prepared = {
  file: string
  data: IngestBundleData
  subjectGrade: string | number
  warnings: string[]
}

/**
 * Ingest every `.js` data module under the given file/dir paths. Two phases:
 *   1. PRE-FLIGHT (read-only): extract + completeness-validate + resolve taxonomy for ALL
 *      files, collecting every problem. If any file fails, throw with the full list and
 *      write NOTHING.
 *   2. WRITE: create all prepared bundles as 1.0.0 drafts inside ONE transaction
 *      (all-or-nothing — a failure rolls back the whole batch).
 */
export async function ingestPaths(payload: Payload, inputPaths: string[]): Promise<IngestResult[]> {
  const files = gatherJsFiles(inputPaths)
  if (files.length === 0) {
    throw new IngestError(`No .js files found at: ${inputPaths.join(', ')}`)
  }

  // Phase 1 — pre-flight (read-only).
  const preflightReq: IngestReq = { payload }
  const prepared: Prepared[] = []
  const errors: string[] = []
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf8')
      const raw = extractAresData(source)
      const data = rawToBundle(raw)
      const problems = validateGeneratable(data)
      if (problems.length > 0) {
        throw new IngestError(`not generatable:\n    - ${problems.join('\n    - ')}`)
      }
      const subjectGrade = await resolveSubjectGrade(payload, raw, preflightReq)
      prepared.push({ file, data, subjectGrade, warnings: deliverableWarnings(data) })
    } catch (e) {
      errors.push(`${path.basename(file)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (errors.length > 0) {
    throw new IngestError(
      `Pre-flight failed (${errors.length}/${files.length} file(s)); nothing was written:\n  - ${errors.join('\n  - ')}`,
    )
  }

  // Phase 2 — write all bundles in one transaction.
  const req: IngestReq = { payload }
  await initTransaction(req)
  try {
    const results: IngestResult[] = []
    for (const { file, data, subjectGrade, warnings } of prepared) {
      const created = await payload.create({
        collection: 'lesson-bundles',
        data: { ...data, subjectGrade } as unknown as RequiredDataFromCollectionSlug<'lesson-bundles'>,
        draft: true,
        req,
      })
      results.push({
        file: path.basename(file),
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
