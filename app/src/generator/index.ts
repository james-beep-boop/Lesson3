/**
 * Lesson3 ⇄ ARES generator integration.
 *
 * The generator under `vendor/` is CommonJS and byte-pristine (see vendor/PROVENANCE.md).
 * We import its builders via createRequire (the app is ESM / "type":"module") and wrap
 * them to return in-memory Buffers — no disk writes, no Python, no edits to vendored code.
 */
import { createRequire } from 'node:module'
import path from 'node:path'

import { withParenthesizedProseLinks } from './proseLinks'

// ⚑ Where the vendored attribution code finds its config — and why this line cannot be removed.
// `vendor/lib/attribution.js` defaults to `<its own dir>/../../config/attribution.yaml`. Inside the Next.js
// production bundle that `__dirname` becomes the BUILD-TIME placeholder `/ROOT/src/generator/vendor/lib`,
// which is never rewritten in the standalone image, so every export died with
// `ENOENT '/ROOT/src/generator/config/attribution.yaml'`. Dev, unit tests and the fidelity scripts all
// resolve the real directory, so only the production image shows it (caught by tests/http/teacherKey).
// The file is shipped into the image by `outputFileTracingIncludes` (next.config.ts); the process always
// starts from the app root (`node server.js` in /app; `next dev`, vitest and tsx from app/). Set BEFORE
// the vendored module is first required below; an explicit ATTRIBUTION_YAML still wins.
process.env.ATTRIBUTION_YAML ??= path.join(
  process.cwd(),
  'src',
  'generator',
  'config',
  'attribution.yaml',
)

const require = createRequire(import.meta.url)
const { buildSoW, buildFinalExplanation, buildSummaryTable } =
  require('./vendor/lib/build_docs.js') as {
    buildSoW: (META: unknown, UNIT: unknown, LESSONS: unknown[]) => Promise<unknown>
    buildFinalExplanation: (
      META: unknown,
      FE: unknown,
      mode?: FinalExplanationMode,
    ) => Promise<unknown>
    buildSummaryTable: (META: unknown, ST: unknown) => Promise<unknown>
  }
const { Packer } = require('docx') as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }

/**
 * Upstream renders the Final Explanation twice from the same data: `student` (prompts, blank answer
 * space, rubric — what learners write on) and `teacher` (prompts beside the exemplar answers — the
 * marking key). Only the teacher mode prints exemplars.
 */
export type FinalExplanationMode = 'student' | 'teacher'

/** The ARES sub-strand data object the generator consumes. */
export interface AresDataObject {
  META: unknown
  UNIT: unknown
  LESSONS: unknown[]
  FINAL_EXPLANATION?: unknown
  SUMMARY_TABLE?: unknown
}

/**
 * The four deliverable DOCX as Buffers. The final explanation and teacher key exist together or not at
 * all (both come from `FINAL_EXPLANATION`); FE/key/ST are null when absent from the bundle. Key order is
 * the document order (lesson plan, student final explanation, teacher key, summary table).
 */
export interface GeneratedDocx {
  lessonSequence: Buffer
  finalExplanation: Buffer | null
  teacherKey: Buffer | null
  summaryTable: Buffer | null
}

/**
 * Generate the CBE DOCX from an ARES data object, in-process, as Buffers.
 *
 * There is ONE document format: the current pristine ARES five-column Section C. Required stored
 * resourceLinks render beneath each phase label through the Lesson3-owned pure-Node bridge, which makes
 * the pristine renderer use each lesson's own `resourceLinks` (see vendor/aresResources.js). The student
 * final explanation, teacher key and summary table use the same pinned upstream builders.
 */
/**
 * Per-deliverable builders, each generating ONE DOCX (the primary always exists; FE/ST return null
 * when the bundle has no such content — matching `GeneratedDocx`'s null contract). Split out so a
 * caller that consumes a single deliverable — the editor's "View as PDF" preview — need not build and
 * discard the other two, and so each deliverable has ONE build definition that `generateBundleDocx`
 * and `generateDeliverableDocx` both compose.
 */
export async function generateLessonSequenceDocx(data: AresDataObject): Promise<Buffer> {
  const { META, UNIT, LESSONS } = withParenthesizedProseLinks(data)
  return Packer.toBuffer(await buildSoW(META, UNIT, LESSONS))
}

async function generateFinalExplanation(
  data: AresDataObject,
  mode: FinalExplanationMode,
): Promise<Buffer | null> {
  const { META, FINAL_EXPLANATION } = withParenthesizedProseLinks(data)
  return FINAL_EXPLANATION
    ? Packer.toBuffer(await buildFinalExplanation(META, FINAL_EXPLANATION, mode))
    : null
}

/** The STUDENT final explanation: no exemplar answers, blank answer space. */
export const generateFinalExplanationDocx = (data: AresDataObject): Promise<Buffer | null> =>
  generateFinalExplanation(data, 'student')

/** The TEACHER key: prompts beside the exemplar answers. Never give this to students. */
export const generateTeacherKeyDocx = (data: AresDataObject): Promise<Buffer | null> =>
  generateFinalExplanation(data, 'teacher')

export async function generateSummaryTableDocx(data: AresDataObject): Promise<Buffer | null> {
  const { META, SUMMARY_TABLE } = withParenthesizedProseLinks(data)
  return SUMMARY_TABLE ? Packer.toBuffer(await buildSummaryTable(META, SUMMARY_TABLE)) : null
}

export async function generateBundleDocx(data: AresDataObject): Promise<GeneratedDocx> {
  return {
    lessonSequence: await generateLessonSequenceDocx(data),
    finalExplanation: await generateFinalExplanationDocx(data),
    teacherKey: await generateTeacherKeyDocx(data),
    summaryTable: await generateSummaryTableDocx(data),
  }
}

/**
 * The per-deliverable builder for each `GeneratedDocx` key. Typing it `Record<keyof GeneratedDocx, …>`
 * makes it COMPILE-TIME exhaustive: adding a deliverable to `GeneratedDocx` fails to type-check until a
 * builder is registered here — no runtime `default`/`throw` scaffolding needed.
 */
const DELIVERABLE_BUILDERS: Record<
  keyof GeneratedDocx,
  (data: AresDataObject) => Promise<Buffer | null>
> = {
  lessonSequence: generateLessonSequenceDocx,
  finalExplanation: generateFinalExplanationDocx,
  teacherKey: generateTeacherKeyDocx,
  summaryTable: generateSummaryTableDocx,
}

/**
 * Generate a SINGLE deliverable DOCX by tag — the editor "View as PDF" per-document path. Returns
 * null for an absent FE/ST (the caller 404s), Buffer otherwise. Tag values match `DeliverableTag`
 * (the export layer's union) by construction (`keyof GeneratedDocx`), kept decoupled so this module
 * needs no import from the export/cache layer.
 */
export function generateDeliverableDocx(
  data: AresDataObject,
  tag: keyof GeneratedDocx,
): Promise<Buffer | null> {
  return DELIVERABLE_BUILDERS[tag](data)
}
