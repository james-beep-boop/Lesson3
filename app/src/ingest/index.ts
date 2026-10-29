/**
 * Upload/import orchestration (SPEC §7): read ARES data files (`.js` modules OR `.json` exports) →
 * create a LessonPlan plus its version 1.0.0 (Official) via the Local API. The CLI is atomic;
 * web uploads reject invalid files and commit the valid subset in one transaction. The two input formats carry deep-equal data for a sub-strand, so only the
 * read step differs (`.json` → JSON.parse; `.js` → safe AST parse) — see `extract.ts`.
 *
 * ENTRY POINTS (trusted, never teacher-facing): the supported import-lessons CLI, the dev-only
 * ingest CLI, and the Site-Administrator-only JSON/ZIP upload endpoint. The dev CLI is atomic;
 * supported imports and web uploads commit their valid subset. All use a TRUSTED Local-API system
 * call (no `req.user` → the field-split permits system-owned fields), so callers MUST enforce
 * authorization first: command-line access is operational authority; the endpoint gates on Site
 * Admin server-side (`isSiteAdmin`). The untrusted-input risk lives in `extract.ts` (parse-never-
 * execute for the dev CLI's `.js`; structural guards for JSON). Neither supported import nor web
 * upload executes input.
 *
 * Lifecycle: valid uploads create version 1.0.0 and immediately mark that exact snapshot
 * Official via the parent LessonPlan. Later edits create additional non-official snapshots;
 * A confirmed new ARES release replaces an ARES Official under the locks. A teacher Official stays
 * unchanged for administrator review.
 *
 * SubjectGrade: resolved by EXACT (Subject.name, grade) match, and nothing is ever created silently.
 * The dev CLI requires existing taxonomy. Supported imports ask like the web upload, which
 * reports every missing item across the request and writes nothing until
 * the Site Administrator approves; the resubmitted upload then creates exactly the approved items the
 * files need, in the same transaction as the plans. Near-miss names: see `taxonomy.ts`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { commitTransaction, initTransaction, killTransaction } from 'payload'
import { lockRows, takeAdvisoryLock } from '../lib/txDb'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import { contractDrift } from './contract'
import { IngestError } from './errors'
import { extractAresData, extractAresJson } from './extract'
import { rawToBundle, type IngestBundleData } from './toBundle'
import { deliverableWarnings, validateGeneratable } from './validateGeneratable'
import { nextMajorForPlan, nextSemverFrom } from '../lib/semver'
import { releaseFingerprint } from '../lib/identity/releaseFingerprint'
import { LessonSetRefused, type AresRelease } from './lessonManifest'
import {
  confirmationRequired,
  decideRelease,
  officialDecision,
  previewToken,
  type OfficialPreview,
} from './releaseDecision'
import { prewarmVersionArtifacts } from '../jobs/prewarmVersionArtifacts'
import { relId } from '../lib/relId'
import { latestRelease, type ReleaseRow } from './releaseAncestry'
import { withReleaseFingerprint } from './releaseFingerprintContext'
import {
  classifyMissingTaxonomy,
  MAX_SUBJECT_NAME_LENGTH,
  normalizeSubjectName,
  taxonomyKey,
  type MissingTaxonomy,
  type TaxonomyKey,
} from './taxonomy'

/** A minimal Local-API request carrier (no user = trusted system path). */
/** A minimal Local-API request carrier — also the shape `prewarmVersionArtifacts` accepts. */
export type IngestReq = Partial<PayloadRequest> & { payload: Payload }
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
   *  plan (SPEC §7). Web/supported import may move an ARES Official after confirmation. */
  action: 'created' | 'revised'
  /** Non-blocking deliverable warnings (e.g. missing FINAL_EXPLANATION / SUMMARY_TABLE). */
  warnings: string[]
  outcome?: 'officialMoved' | 'officialKept'
  previousSemver?: string | null
  releaseDate?: string | null
  reason?: string
}

/**
 * Serialize concurrent ingests per subject-grade: `SELECT … FOR UPDATE` on the subject_grades rows
 * inside the write transaction (audit 2026-07-06 #2). Without it, two simultaneous uploads of the
 * same NEW non-empty substrand_id both preflight to "no existing plan" and both create Official
 * 1.0.0 plans — every later upload of that sub-strand then hits the duplicate-plan ambiguity guard.
 *
 * ⚑ The ascending-order and tx-bound-connection mechanics now live in `lib/txDb.ts`'s `lockRows`.
 * This function had hand-rolled them, and its fallback to the pool meant that an unresolvable
 * transaction session produced a lock holding NOTHING while ingest proceeded as though serialised —
 * the docblock's old claim that "outside a transaction the lock is a harmless no-op" was true only
 * of the no-op, not of the harmlessness. `lockRows` fails closed; every caller was checked to run
 * inside a transaction (this one via `initTransaction` in `writePrepared`).
 *
 * Kept as a named function rather than inlined: it is the documented seam for the wiring spec, since
 * true concurrency can't be pinned in a unit test.
 */
export async function lockSubjectGrades(
  payload: Payload,
  transactionID: PayloadRequest['transactionID'],
  subjectGradeIds: number[],
): Promise<void> {
  await lockRows({ payload, transactionID }, 'subject_grades', subjectGradeIds)
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
        // ⚑ NOT `equals`: the lookup key is TRIMMED, but the stored META keeps the file's value
        // losslessly, so a padded ` 77.2 ` never equalled its own re-import and every upload made a
        // new plan (audit F-C40-001). `contains` narrows the candidates (it can only over-match);
        // the trim-equality filter below is the actual identity test, and also matches records
        // already stored padded.
        { 'meta.substrand_id': { contains: substrandId } },
      ],
    },
    depth: 0,
    pagination: false,
    select: { lessonPlan: true, meta: { substrand_id: true } },
    req,
  })
  const planIds = [
    ...new Set(
      docs
        .filter((d) => {
          const stored = (d as { meta?: { substrand_id?: unknown } }).meta?.substrand_id
          return typeof stored === 'string' && stored.trim() === substrandId
        })
        .map((d) => relId((d as { lessonPlan?: unknown }).lessonPlan))
        .filter((id): id is number => id != null),
    ),
  ]
  if (planIds.length > 1) {
    throw new IngestError(
      `sub-strand ${JSON.stringify(substrandId)} matches ${planIds.length} existing lesson plans ` +
        `(#${planIds.join(', #')}) in this subject-grade — resolve the duplicate before re-ingesting.`,
    )
  }
  return planIds[0] ?? null
}

/** A file's taxonomy: `subjectGradeId` null = missing (and `subjectId` null = the subject too). */
type ResolvedTaxonomy = TaxonomyKey & { subjectId: number | null; subjectGradeId: number | null }

/** Resolve META.subject / META.grade by EXACT match. Throws only for absent or malformed META. */
async function resolveTaxonomy(
  payload: Payload,
  raw: Record<string, unknown>,
  req: IngestReq,
): Promise<ResolvedTaxonomy> {
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
    // A NEW subject is offered to the Site Administrator for creation, so it must be a name the
    // approval parser will accept back — else preview offers what confirmation refuses (F-C40-002).
    if (subjectName.length > MAX_SUBJECT_NAME_LENGTH) {
      throw new IngestError(
        `META.subject is longer than ${MAX_SUBJECT_NAME_LENGTH} characters, so it cannot be created as a new subject.`,
      )
    }
    return { subject: subjectName, grade, subjectId: null, subjectGradeId: null }
  }

  const sgs = await payload.find({
    collection: 'subject-grades',
    where: { and: [{ subject: { equals: subject.id } }, { grade: { equals: grade } }] },
    limit: 1,
    depth: 0,
    req,
  })
  return {
    subject: subjectName,
    grade,
    subjectId: subject.id,
    subjectGradeId: sgs.docs[0]?.id ?? null,
  }
}

/** The CLI's hard failure for missing taxonomy (the web upload offers to create it instead). */
async function missingTaxonomyMessage(
  payload: Payload,
  t: ResolvedTaxonomy,
  req: IngestReq,
): Promise<string> {
  if (t.subjectId == null) {
    const all = await payload.find({ collection: 'subjects', limit: 200, depth: 0, req })
    const names = all.docs.map((d) => `"${d.name}"`).join(', ') || '(none)'
    return `No subject named "${t.subject}". Existing subjects: ${names}. Create the subject and its subject grade (Manage → Subjects and grades) before importing.`
  }
  return `No subject grade for "${t.subject}" Grade ${t.grade}. Create it (Manage → Subjects and grades → Subject grades) before importing.`
}

/** What a declined (unticked) item's files are rejected with. */
const declinedMessage = (item: MissingTaxonomy): string =>
  item.similarTo.length > 0
    ? `Not created: "${item.subject}" is similar to "${item.similarTo.join('", "')}". If it is a misspelling, correct META.subject in the file and upload again.`
    : `Not created: you chose not to create ${item.subject} — Grade ${item.grade}.`

/** A Subject or SubjectGrade this upload created. */
export type CreatedTaxonomy = TaxonomyKey & { newSubject: boolean }

/**
 * Create the approved taxonomy inside the upload's write transaction (SPEC §7, amended 2026-10-21).
 * Runs under the `taxonomyCreate` advisory lock, so two uploads approving the same new subject
 * serialise: the second finds the first's rows instead of tripping the unique index (which would abort
 * the whole transaction). Re-checks the case/spacing rule against subjects added since pre-flight.
 */
async function createApprovedTaxonomy(
  payload: Payload,
  req: IngestReq,
  keys: TaxonomyKey[],
): Promise<{ ids: Map<string, number>; created: CreatedTaxonomy[] }> {
  await takeAdvisoryLock(req, 'taxonomyCreate')
  const ids = new Map<string, number>()
  const created: CreatedTaxonomy[] = []
  const subjectIds = new Map<string, { id: number; isNew: boolean }>()
  for (const key of keys) {
    let subject = subjectIds.get(key.subject)
    if (!subject) {
      const found = await payload.find({
        collection: 'subjects',
        where: { name: { equals: key.subject } },
        limit: 1,
        depth: 0,
        req,
      })
      if (found.docs[0]) {
        subject = { id: found.docs[0].id, isNew: false }
      } else {
        const all = await payload.find({
          collection: 'subjects',
          pagination: false,
          depth: 0,
          select: { name: true },
          req,
        })
        const clash = all.docs.find(
          (d) => normalizeSubjectName(d.name) === normalizeSubjectName(key.subject),
        )
        if (clash) {
          throw new IngestError(
            `Subject "${clash.name}" was added while this upload was waiting, and "${key.subject}" differs from it only in capitals or spacing. Nothing was imported; upload again.`,
          )
        }
        const doc = await payload.create({
          collection: 'subjects',
          data: { name: key.subject },
          overrideAccess: true, // trusted system path: the endpoint authorized a Site Administrator
          req,
        })
        subject = { id: doc.id, isNew: true }
      }
      subjectIds.set(key.subject, subject)
    }
    const sgs = await payload.find({
      collection: 'subject-grades',
      where: { and: [{ subject: { equals: subject.id } }, { grade: { equals: key.grade } }] },
      limit: 1,
      depth: 0,
      req,
    })
    let sgId = sgs.docs[0]?.id
    if (sgId == null) {
      const doc = await payload.create({
        collection: 'subject-grades',
        data: { subject: subject.id, grade: key.grade },
        overrideAccess: true, // trusted system path, as above
        req,
      })
      sgId = doc.id
      created.push({ subject: key.subject, grade: key.grade, newSubject: subject.isNew })
    }
    ids.set(taxonomyKey(key), sgId)
  }
  return { ids, created }
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
  release?: AresRelease
  setId?: string
  data: IngestBundleData
  /** Null = approved new taxonomy, created and filled in by `writePrepared`. */
  subjectGrade: number | null
  taxonomy: TaxonomyKey
  /** The sub-strand identity, for intra-batch duplicate detection. */
  substrandId: string
  /** Existing plan to attach to as the next major (SPEC §7 re-ingest), or null to create a new one. */
  existingPlanId: number | null
  warnings: string[]
  /** `releaseFingerprint(data)`, computed once: the release decision and the create both use it. */
  fingerprint: string
}

/**
 * One ingest input: a named source plus a thunk that produces its raw bundle. `extract` is
 * a thunk (not an eagerly-parsed object) so a parse failure is caught and AGGREGATED in
 * pre-flight alongside validation/taxonomy problems, rather than aborting the whole batch on
 * the first bad file. The thunk also lets each caller choose the safe parser: the CLI picks
 * by extension (`.js` AST / `.json` JSON.parse); the upload endpoint always uses
 * `extractAresJson`. Neither path ever executes the input.
 */
export type IngestItem = {
  name: string
  release?: AresRelease
  setId?: string
  warnings?: string[]
  extract: () => Record<string, unknown> | Promise<Record<string, unknown>>
}

export type IngestRejection = { file: string; error: string }
export type IngestReport = {
  bundles: IngestResult[]
  rejected: IngestRejection[]
  skipped: IngestRejection[]
  /** Subjects/SubjectGrades this upload created on the Site Administrator's approval. */
  created: CreatedTaxonomy[]
  /** Nothing written: taxonomy and/or the Official preview awaits confirmation. */
  needsConfirmation: boolean
  missing: MissingTaxonomy[]
  official?: OfficialPreview[]
  previewToken?: string
  confirmationChanged?: boolean
  alreadyHere?: IngestRejection[]
  olderNotImported?: IngestRejection[]
  setRefused: IngestRejection[]
}

/**
 * Each existing plan's release decision and Official preview, from metadata only: one query for the
 * plans and one for their histories, however many files. Fingerprints identify ARES releases,
 * irrespective of teacher saves. A reused release id refuses its whole set; that comes back as data
 * so pre-flight can drop the set and the locked write can abort, each by its own policy.
 */
async function releasePreview(
  payload: Payload,
  prepared: Prepared[],
  req: IngestReq,
): Promise<{ preview: OfficialPreview[]; refused: LessonSetRefused[] }> {
  // Initial 1.0.0 creation replaces no Official, so only existing plans belong in the preview.
  const existing = prepared.filter((p) => p.existingPlanId != null)
  if (existing.length === 0) return { preview: [], refused: [] }
  const planIds = [...new Set(existing.map((p) => p.existingPlanId!))]
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    where: { id: { in: planIds } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
    select: { officialVersion: true },
  })
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { in: planIds } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
    select: {
      lessonPlan: true,
      semver: true,
      releaseFingerprint: true,
      aresReleaseId: true,
      aresReleaseDate: true,
    },
  })
  const officialOf = new Map(plans.map((plan) => [plan.id, relId(plan.officialVersion)]))
  const historyOf = new Map<number, typeof versions>()
  for (const v of versions) {
    const plan = relId(v.lessonPlan)!
    const history = historyOf.get(plan)
    if (history) history.push(v)
    else historyOf.set(plan, [v])
  }
  const refused = new Map<string | undefined, LessonSetRefused>()
  const entries: { setId?: string; entry: OfficialPreview }[] = []
  for (const p of existing) {
    const planId = p.existingPlanId!
    const history = historyOf.get(planId) ?? []
    const decision = decideRelease(history, p.fingerprint, p.release)
    if (decision.action === 'conflict') {
      // The set's first conflict names it, as the report has always done.
      if (!refused.has(p.setId))
        refused.set(
          p.setId,
          new LessonSetRefused(
            `This lesson set says it is ARES release ${p.release!.id}, but its contents differ from the ${p.release!.id} release already here (e.g. '${p.data.title}', version ${decision.version!.semver}). Nothing from this set was imported.`,
            p.setId,
          ),
        )
      continue
    }
    const official = history.find((v) => v.id === officialOf.get(planId))
    const move = officialDecision(official)
    entries.push({
      setId: p.setId,
      entry: {
        file: p.name,
        plan: planId,
        title: p.data.title,
        incomingSemver: nextSemverFrom(
          history.map((v) => v.semver),
          'major',
        ),
        currentOfficial: officialOf.get(planId) ?? null,
        previousSemver: official?.semver ?? null,
        release: p.release ?? null,
        fingerprint: p.fingerprint,
        decision: decision.action,
        willMove: decision.action === 'new' && move.willMove,
        reason:
          decision.action === 'alreadyHere'
            ? `Unchanged — ARES release already here, version ${decision.version!.semver}`
            : decision.action === 'olderNotImported'
              ? `Older than the release already here (${p.release!.date} is older than ${decision.version!.aresReleaseDate}).`
              : move.reason,
        olderContent: decision.olderContent?.semver ?? null,
      },
    })
  }
  return {
    // A refused set contributes nothing, including files decided before its conflict was found.
    preview: entries.filter((e) => !refused.has(e.setId)).map((e) => e.entry),
    refused: [...refused.values()],
  }
}

/** The decisions changed under the write locks; nothing was written, ask again with these. */
class ConfirmOfficial extends Error {
  constructor(readonly official: OfficialPreview[]) {
    super('The Official preview changed before writing.')
  }
}

const refusalOf = (e: LessonSetRefused): IngestRejection => ({
  file: e.setId ?? 'Lesson set',
  error: e.message,
})

/** Ask only about the missing taxonomy that surviving files still need. */
const narrowMissing = (missing: MissingTaxonomy[], kept: Prepared[]): MissingTaxonomy[] => {
  const names = new Set(kept.map((p) => p.name))
  return missing
    .map((m) => ({ ...m, files: m.files.filter((f) => names.has(f)) }))
    .filter((m) => m.files.length > 0)
}

/**
 * Read-only validation shared by the atomic CLI and partial web upload.
 *
 * `approvals` (web only): undefined = the Site Administrator has not been asked yet, so any offerable
 * missing taxonomy sets `needsConfirmation` and the caller must write nothing. An array = their
 * answer: approved items' files are prepared with `subjectGrade: null` (created at write time), the
 * rest are rejected, and an approval the files do not need is refused outright.
 */
async function prepareItems(
  payload: Payload,
  items: IngestItem[],
  partial: boolean,
  approvals?: TaxonomyKey[],
): Promise<{
  prepared: Prepared[]
  rejected: IngestRejection[]
  missing: MissingTaxonomy[]
  needsConfirmation: boolean
}> {
  // Phase 1 — pre-flight (read-only).
  const preflightReq: IngestReq = { payload }
  const prepared: Prepared[] = []
  const rejected: IngestRejection[] = []
  /** Web upload: validated files whose taxonomy is missing, held until classification below. */
  const pending: (Omit<Prepared, 'subjectGrade' | 'existingPlanId'> & {
    subjectExists: boolean
  })[] = []
  // Memoize taxonomy resolution across the batch: a directory of sub-strands is typically all one
  // subject-grade, so without this `resolveTaxonomy` re-runs its 2 finds for every file.
  const sgCache = new Map<string, Promise<ResolvedTaxonomy>>()
  const resolveTaxonomyCached = (raw: Record<string, unknown>): Promise<ResolvedTaxonomy> => {
    const meta = (raw.META ?? {}) as Record<string, unknown>
    const cacheKey = `${typeof meta.subject === 'string' ? meta.subject.trim() : ''}::${meta.grade}`
    let hit = sgCache.get(cacheKey)
    if (!hit) {
      hit = resolveTaxonomy(payload, raw, preflightReq)
      sgCache.set(cacheKey, hit)
    }
    return hit
  }
  for (const { name, extract, release, setId, warnings: inputWarnings = [] } of items) {
    let inputValidated = false
    try {
      const raw = await extract()
      const data = rawToBundle(raw)
      const problems = validateGeneratable(data)
      if (problems.length > 0) {
        throw new IngestError(`not generatable:\n    - ${problems.join('\n    - ')}`)
      }
      // Contract drift is a HARD GATE: ARES adopted ares-contract.schema.json, so any divergence
      // is a regression that must reject this file. Validate the RAW (UPPERCASE)
      // object, the shape the contract describes. See docs/DECISIONS.md (warn-only → hard gate).
      const drift = contractDrift(raw)
      if (drift.length > 0) {
        throw new IngestError(`contract drift:\n    - ${drift.join('\n    - ')}`)
      }
      inputValidated = true
      const fingerprint = releaseFingerprint(data as unknown as Record<string, unknown>)
      const resolved = await resolveTaxonomyCached(raw)
      const taxonomy = { subject: resolved.subject, grade: resolved.grade }
      const substrandId = substrandIdOf(raw)
      const subjectGrade = resolved.subjectGradeId
      if (subjectGrade == null) {
        if (!partial) {
          throw new IngestError(await missingTaxonomyMessage(payload, resolved, preflightReq))
        }
        // A new subject-grade has no plans, so there is no re-ingest target to resolve here.
        pending.push({
          name,
          release,
          setId,
          data,
          taxonomy,
          substrandId,
          warnings: [...inputWarnings, ...deliverableWarnings(data)],
          fingerprint,
          subjectExists: resolved.subjectId != null,
        })
        continue
      }
      // Re-ingest resolution (SPEC §7): the existing plan to attach to as a new major, or null to
      // create a new plan. >1 match (legacy duplicates) throws inside findExistingPlan.
      const existingPlanId = await findExistingPlan(
        payload,
        subjectGrade,
        substrandId,
        preflightReq,
      )
      prepared.push({
        name,
        release,
        setId,
        data,
        subjectGrade,
        taxonomy,
        substrandId,
        existingPlanId,
        warnings: [...inputWarnings, ...deliverableWarnings(data)],
        fingerprint,
      })
    } catch (e) {
      // Missing taxonomy and ambiguous identities are input rejections. An unexpected database
      // failure must abort pre-flight, rather than mislabel a valid file and commit only its peers.
      if (partial && inputValidated && !(e instanceof IngestError)) throw e
      rejected.push({ file: name, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Missing taxonomy (web only): block what may never be created, then apply the approvals — or,
  // before any were given, hold every offered item's files for the confirmation round.
  let missing: MissingTaxonomy[] = []
  let offeredByKey = new Map<string, MissingTaxonomy>()
  if (pending.length > 0) {
    const { docs: subjects } = await payload.find({
      collection: 'subjects',
      pagination: false,
      depth: 0,
      select: { name: true },
      req: preflightReq,
    })
    // Reconcile with taxonomy created since each file was resolved (a concurrent upload or Manage):
    // a file whose exact subject now exists is looked up again, so it either resolves normally or
    // waits only on its grade — never "differs from itself only in capitals or spacing".
    const subjectNames = new Set(subjects.map((s) => s.name))
    for (const p of pending.splice(0)) {
      if (p.subjectExists || !subjectNames.has(p.taxonomy.subject)) {
        pending.push(p)
        continue
      }
      try {
        const again = await resolveTaxonomy(payload, { META: { ...p.taxonomy } }, preflightReq)
        if (again.subjectGradeId == null) {
          pending.push({ ...p, subjectExists: true })
          continue
        }
        const { subjectExists: _, ...rest } = p
        prepared.push({
          ...rest,
          subjectGrade: again.subjectGradeId,
          existingPlanId: await findExistingPlan(
            payload,
            again.subjectGradeId,
            p.substrandId,
            preflightReq,
          ),
        })
      } catch (e) {
        if (!(e instanceof IngestError)) throw e
        rejected.push({ file: p.name, error: e.message })
      }
    }
    const { offered, blocked } = classifyMissingTaxonomy(
      pending.map((p) => ({ ...p.taxonomy, file: p.name, subjectExists: p.subjectExists })),
      subjects.map((s) => s.name),
    )
    rejected.push(...blocked)
    missing = offered
    offeredByKey = new Map(offered.map((o) => [taxonomyKey(o), o]))
  }
  if (approvals) {
    // An approval must name something these files need. One for an item that has come to exist
    // since the question was asked creates nothing, so it is harmless and passes.
    const existing = new Set(prepared.map((p) => taxonomyKey(p.taxonomy)))
    const stray = approvals.filter(
      (a) => !offeredByKey.has(taxonomyKey(a)) && !existing.has(taxonomyKey(a)),
    )
    if (stray.length > 0) {
      throw new IngestError(
        `Approved items not needed by these files: ${stray.map((a) => `${a.subject} — Grade ${a.grade}`).join(', ')}. Nothing was imported; upload again.`,
      )
    }
  }
  if (pending.length > 0) {
    const approved = new Set(approvals?.map(taxonomyKey))
    for (const { subjectExists: _, ...p } of pending) {
      const item = offeredByKey.get(taxonomyKey(p.taxonomy))
      if (!item) continue // blocked, already rejected
      if (approvals && !approved.has(taxonomyKey(item))) {
        rejected.push({ file: p.name, error: declinedMessage(item) })
        continue
      }
      prepared.push({ ...p, subjectGrade: null, existingPlanId: null })
    }
  }
  const needsConfirmation = !approvals && missing.length > 0

  // Reject every member of an ambiguous group on web uploads; never choose an arbitrary winner.
  // Keyed by the exact (subject, grade) names, which map 1:1 to a subject-grade, so files awaiting
  // new taxonomy are checked too.
  const seen = new Map<string, Prepared>()
  const duplicates = new Set<Prepared>()
  for (const p of prepared) {
    if (!p.substrandId) continue
    const key = `${taxonomyKey(p.taxonomy)}::${p.substrandId}`
    const prior = seen.get(key)
    if (prior) {
      const error =
        `duplicate of "${prior.name}" in this batch — both target sub-strand ` +
        `${JSON.stringify(p.substrandId)} in the same subject-grade. Upload one at a time.`
      rejected.push({ file: p.name, error })
      if (partial && !duplicates.has(prior)) {
        rejected.push({
          file: prior.name,
          error: `duplicate of "${p.name}" in this batch. Upload one at a time.`,
        })
      }
      duplicates.add(prior)
      duplicates.add(p)
    } else {
      seen.set(key, p)
    }
  }
  const kept = prepared.filter((p) => !duplicates.has(p))
  if (needsConfirmation) missing = narrowMissing(missing, kept)
  return {
    prepared: kept,
    rejected,
    missing,
    needsConfirmation: needsConfirmation && missing.length > 0,
  }
}

/** Atomic CLI entry: any pre-flight failure prevents all writes. Trusted callers only. */
export async function ingestItems(payload: Payload, items: IngestItem[]): Promise<IngestResult[]> {
  if (items.length === 0) throw new IngestError('No bundles to ingest.')
  const { prepared, rejected } = await prepareItems(payload, items, false)
  if (rejected.length > 0) {
    throw new IngestError(
      `Pre-flight failed (${rejected.length}/${items.length} file(s)); nothing was written:\n  - ` +
        rejected.map((r) => `${r.file}: ${r.error}`).join('\n  - '),
    )
  }
  return (await writePrepared(payload, prepared)).bundles
}

/**
 * Web upload: reject invalid files, then commit all valid files together. Database/write failures
 * still roll back the transaction and propagate; a malformed input cannot prevent valid imports.
 * Missing taxonomy: see `prepareItems` — without `approvals`, an upload that needs any returns
 * `needsConfirmation` and writes nothing at all.
 * TRUSTED system path: the endpoint must authorize the caller before invoking this function.
 */
export async function ingestUploadItems(
  payload: Payload,
  items: IngestItem[],
  approvals?: TaxonomyKey[],
  confirmOfficial?: string,
): Promise<IngestReport> {
  const preflight = await prepareItems(payload, items, true, approvals)
  const { rejected } = preflight
  // A zip/directory is one set. A refused set never prevents unrelated sets' valid files.
  const { preview: official, refused } = await releasePreview(payload, preflight.prepared, {
    payload,
  })
  const refusedSets = new Set(refused.map((e) => e.setId))
  const prepared = preflight.prepared.filter((p) => !refusedSets.has(p.setId))
  const missing = narrowMissing(preflight.missing, prepared)
  const base: IngestReport = {
    bundles: [],
    skipped: [],
    created: [],
    rejected,
    missing,
    needsConfirmation: preflight.needsConfirmation && missing.length > 0,
    setRefused: refused.map(refusalOf),
  }
  const awaitConfirmation = (preview: OfficialPreview[], changed: boolean): IngestReport => ({
    ...base,
    needsConfirmation: true,
    official: preview,
    previewToken: previewToken(preview),
    confirmationChanged: changed,
  })
  if (base.needsConfirmation || confirmationRequired(official, confirmOfficial)) {
    const changed = confirmOfficial !== undefined && confirmOfficial !== previewToken(official)
    return awaitConfirmation(official, changed)
  }
  try {
    const written =
      prepared.length > 0
        ? await writePrepared(payload, prepared, { confirmOfficial })
        : { bundles: [], skipped: [], created: [], alreadyHere: [], olderNotImported: [] }
    return { ...base, ...written, missing: [], needsConfirmation: false }
  } catch (e) {
    if (e instanceof ConfirmOfficial) return awaitConfirmation(e.official, true)
    if (e instanceof LessonSetRefused)
      return { ...base, setRefused: [...base.setRefused, refusalOf(e)] }
    throw e
  }
}

/**
 * `upload` set = the release rules (web upload and supported import): release decisions, the
 * token-bound Official confirmation and automatic Official moves. Unset = the dev CLI's atomic
 * import, which never moves an existing plan's Official.
 */
async function writePrepared(
  payload: Payload,
  preparedIn: Prepared[],
  upload?: { confirmOfficial?: string },
): Promise<
  Pick<IngestReport, 'bundles' | 'skipped' | 'created' | 'alreadyHere' | 'olderNotImported'>
> {
  // Phase 2 — write all bundles in one transaction.
  const req: IngestReq = { payload }
  await initTransaction(req)
  try {
    // Approved new taxonomy first, so a failed write below leaves no orphan Subject/SubjectGrade.
    // Its advisory lock precedes the row locks below (LOCK ORDER, `lib/txDb.ts`).
    const toCreate = [
      ...new Map(
        preparedIn
          .filter((p) => p.subjectGrade == null)
          .map((p) => [taxonomyKey(p.taxonomy), p.taxonomy]),
      ).values(),
    ]
    const { ids, created } =
      toCreate.length > 0
        ? await createApprovedTaxonomy(payload, req, toCreate)
        : { ids: new Map<string, number>(), created: [] }
    const prepared = preparedIn.map((p) => ({
      ...p,
      subjectGrade: p.subjectGrade ?? ids.get(taxonomyKey(p.taxonomy))!,
    }))
    // Serialize against concurrent ingests of the same subject-grade BEFORE any read/write, then
    // re-resolve each file's plan inside the transaction: the preflight lookup above ran outside
    // it, so a concurrent upload committing between preflight and here could otherwise duplicate a
    // "new" sub-strand's plan (audit 2026-07-06 #2). Post-lock, the re-check is race-free.
    await lockSubjectGrades(
      payload,
      req.transactionID,
      prepared.map((p) => p.subjectGrade),
    )
    // LOCK ORDER: taxonomy advisory → sorted subject-grades → sorted plans. Re-resolve even
    // known plans after the subject-grade lock; no preview or id survives as a write authority.
    for (const p of prepared)
      p.existingPlanId = await findExistingPlan(payload, p.subjectGrade, p.substrandId, req)
    await lockRows(
      req,
      'lesson_plans',
      prepared.flatMap((p) => (p.existingPlanId == null ? [] : [p.existingPlanId])),
    )
    const { preview: official, refused } = upload
      ? await releasePreview(payload, prepared, req)
      : { preview: [], refused: [] }
    if (refused[0]) throw refused[0]
    if (upload && confirmationRequired(official, upload.confirmOfficial))
      throw new ConfirmOfficial(official)
    // Only existing plans receiving a release need ancestry. Read their metadata together, after
    // the locks and confirmation checks, rather than once per file in the write loop. A preceding
    // write cannot change a later file's predecessor: duplicate sub-strand identities are rejected,
    // and latestRelease only considers rows with the incoming file's own sub-strand identity.
    const revisionPlanIds = [
      ...new Set(
        prepared.flatMap((p) => {
          if (p.existingPlanId == null) return []
          // Match the write loop's first decision, including legacy plans with repeated file names.
          const decision = official.find((o) => o.file === p.name && o.plan === p.existingPlanId)
          return decision && decision.decision !== 'new' ? [] : [p.existingPlanId]
        }),
      ),
    ]
    const ancestryByPlan = new Map<number, ReleaseRow[]>()
    if (revisionPlanIds.length > 0) {
      const { docs: history } = await payload.find({
        collection: 'lesson-bundle-versions',
        where: { lessonPlan: { in: revisionPlanIds } },
        pagination: false,
        depth: 0,
        select: {
          lessonPlan: true,
          semver: true,
          author: true,
          sourceVersion: true,
          mergedFrom: true,
          meta: true,
        },
        req,
      })
      for (const v of history) {
        const planId = relId(v.lessonPlan)!
        const rows = ancestryByPlan.get(planId) ?? []
        rows.push({
          id: v.id,
          semver: v.semver,
          author: relId(v.author),
          source: relId(v.sourceVersion),
          second: relId(v.mergedFrom),
          substrandId: v.meta?.substrand_id ?? null,
        })
        ancestryByPlan.set(planId, rows)
      }
    }
    const results: IngestResult[] = []
    const skipped: IngestRejection[] = []
    const alreadyHere: IngestRejection[] = []
    const olderNotImported: IngestRejection[] = []
    for (const {
      name,
      data,
      subjectGrade,
      substrandId,
      warnings,
      release,
      fingerprint,
      existingPlanId,
    } of prepared) {
      const decision = official.find((o) => o.file === name && o.plan === existingPlanId)
      if (decision && decision.decision !== 'new') {
        const issue = { file: name, error: decision.reason }
        skipped.push(issue)
        ;(decision.decision === 'alreadyHere' ? alreadyHere : olderNotImported).push(issue)
        continue
      }
      if (existingPlanId != null) {
        // Existing plans allocate the next whole major; teacher saves never suppress a release.
        // The dev-only atomic CLI retains its explicit revision behaviour (no Official moves).
        // The preview computed it from this plan's history under the same locks.
        const semver =
          decision?.incomingSemver ?? (await nextMajorForPlan(payload, existingPlanId, req))
        const predecessor = latestRelease(ancestryByPlan.get(existingPlanId) ?? [], substrandId)
        const version = await withReleaseFingerprint(
          req,
          fingerprint,
          () =>
            payload.create({
              collection: LESSON_BUNDLE_VERSIONS,
              data: {
                ...data,
                lessonPlan: existingPlanId,
                subjectGrade,
                semver,
                sourceVersion: predecessor?.id ?? null,
              } as never,
              req,
            }),
          release,
        )
        if (decision?.willMove) {
          await payload.update({
            collection: LESSON_PLANS,
            id: existingPlanId,
            data: { officialVersion: version.id, title: data.title } as never,
            overrideAccess: true,
            req,
          })
          await prewarmVersionArtifacts(req, Number(version.id))
        }
        results.push({
          file: name,
          id: existingPlanId,
          title: data.title,
          subjectGrade,
          semver,
          official: decision?.willMove ?? false,
          outcome: decision?.willMove ? 'officialMoved' : 'officialKept',
          previousSemver: decision?.previousSemver,
          reason: decision?.reason,
          releaseDate: release?.date ?? null,
          action: 'revised',
          warnings,
        })
        continue
      }

      // NEW plan: version 1.0.0, made Official immediately (ingest order: plan → version → pointer).
      //
      // ⚠️ LOAD-BEARING: caller access DENIES both creates below outright — `lessonPlanCreate` and
      // `lessonBundleVersionCreate` are `() => false` (`access/versioning.ts`), so a bare plan with
      // no Official pointer cannot be minted and a provenance-less version cannot be created.
      // Ingest is the only sanctioned way either row is born, and it gets through because the LOCAL
      // API defaults `overrideAccess` to TRUE. `overrideAccess: true` is passed EXPLICITLY below so
      // that stays visible at the point of risk rather than riding a library default.
      //
      // (Corrected 2026-07-21: an earlier version of this comment claimed the creates succeed
      // because `req` carries no `user`, and that attaching one would cause a 403. That is wrong —
      // `overrideAccess` is what bypasses access, independently of `req.user`. The absence of a user
      // matters for a DIFFERENT reason: `hooks/fieldSplit.ts` treats a user-less request as a system
      // path and lets it write system-owned fields. Both facts are load-bearing; they are not the
      // same fact.)
      const plan = await payload.create({
        collection: LESSON_PLANS,
        data: {
          title: data.title,
          subjectGrade,
        } as never,
        overrideAccess: true, // explicit: caller access is `() => false` (see the note above)
        req,
      })
      const version = await withReleaseFingerprint(
        req,
        fingerprint,
        () =>
          payload.create({
            collection: LESSON_BUNDLE_VERSIONS,
            data: {
              ...data,
              lessonPlan: plan.id,
              subjectGrade,
              semver: '1.0.0',
            } as never,
            overrideAccess: true, // explicit: caller access is `() => false` (see the note above)
            req,
          }),
        release,
      )
      await payload.update({
        collection: LESSON_PLANS,
        id: plan.id,
        data: {
          officialVersion: version.id,
        } as never,
        req,
      })
      // Pre-warm docx+pdf for the new Official (teacher-first track T1). Ingest is a system path
      // (no req.user), so the lesson-plans prewarm hook deliberately does not fire — this explicit
      // opt-in is the one system caller that wants warming. Never throws; rides this transaction.
      await prewarmVersionArtifacts(req, Number(version.id))
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
    return { bundles: results, skipped, created, alreadyHere, olderNotImported }
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
