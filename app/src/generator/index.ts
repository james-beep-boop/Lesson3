/**
 * Lesson3 ⇄ ARES generator integration.
 *
 * The generator under `vendor/` is CommonJS and byte-pristine (see vendor/PROVENANCE.md).
 * We import its builders via createRequire (the app is ESM / "type":"module") and wrap
 * them to return in-memory Buffers — no disk writes, no Python, no edits to vendored code.
 */
import { createRequire } from 'node:module'

import './attributionEnvironment'
import { buildCompactTeacherGuide, buildStudentSummaryTable } from './companionDocuments'
import type { DeliverableTag } from './deliverables'
import { withParenthesizedProseLinks } from './proseLinks'

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
type FinalExplanationMode = 'student' | 'teacher'

/** The ARES sub-strand data object the generator consumes. */
export interface AresDataObject {
  META: unknown
  UNIT: unknown
  LESSONS: unknown[]
  FINAL_EXPLANATION?: unknown
  SUMMARY_TABLE?: unknown
}

type AlwaysGenerated = 'lessonSequence' | 'compactTeacherGuide' | 'studentSummaryTable'

/**
 * The deliverable DOCX as Buffers. The final explanation and teacher key both come from
 * `FINAL_EXPLANATION`. Those two and the filled summary table are null when absent from the bundle.
 */
export type GeneratedDocx = Record<AlwaysGenerated, Buffer> &
  Record<Exclude<DeliverableTag, AlwaysGenerated>, Buffer | null>

/**
 * Generate the lesson plan in the pinned ARES layout. Stored resourceLinks render beneath
 * each phase label through the bridge in vendor/aresResources.js.
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

const generateCompactTeacherGuideDocx = (data: AresDataObject): Promise<Buffer> =>
  Packer.toBuffer(buildCompactTeacherGuide(data))

const generateStudentSummaryTableDocx = (data: AresDataObject): Promise<Buffer> =>
  Packer.toBuffer(buildStudentSummaryTable(data))

export async function generateBundleDocx(data: AresDataObject): Promise<GeneratedDocx> {
  return {
    lessonSequence: await generateLessonSequenceDocx(data),
    finalExplanation: await generateFinalExplanationDocx(data),
    teacherKey: await generateTeacherKeyDocx(data),
    summaryTable: await generateSummaryTableDocx(data),
    compactTeacherGuide: await generateCompactTeacherGuideDocx(data),
    studentSummaryTable: await generateStudentSummaryTableDocx(data),
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
  compactTeacherGuide: generateCompactTeacherGuideDocx,
  studentSummaryTable: generateStudentSummaryTableDocx,
}

/**
 * Generate one DOCX for the "View as PDF" preview. An absent optional document returns null.
 */
export function generateDeliverableDocx(
  data: AresDataObject,
  tag: keyof GeneratedDocx,
): Promise<Buffer | null> {
  return DELIVERABLE_BUILDERS[tag](data)
}
