/**
 * Lesson3 ⇄ ARES generator integration.
 *
 * The generator under `vendor/` is CommonJS and byte-pristine (see vendor/PROVENANCE.md).
 * We import its builders via createRequire (the app is ESM / "type":"module") and wrap
 * them to return in-memory Buffers — no disk writes, no Python, no edits to vendored code.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildSoW, buildFinalExplanation, buildSummaryTable } =
  require('./vendor/lib/build_docs.js') as {
    buildSoW: (META: unknown, UNIT: unknown, LESSONS: unknown) => Promise<unknown>
    buildFinalExplanation: (META: unknown, FE: unknown) => Promise<unknown>
    buildSummaryTable: (META: unknown, ST: unknown) => Promise<unknown>
  }
const { buildSoWCompact } =
  require('./buildSowCompact.js') as {
    buildSoWCompact: (META: unknown, UNIT: unknown, LESSONS: unknown) => Promise<unknown>
  }
const { Packer } = require('docx') as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }

/**
 * LessonSequence layout variant, chosen per-export (a presentation choice, never
 * stored on the bundle — SPEC "edit the data, never the document"):
 *  - 'standard' (default): the pristine vendored layout (6-column Section C with
 *    the Resource column; byte-stable fidelity path).
 *  - 'compact': Section C drops the Resource column and re-balances widths
 *    (Phase 1.57", the other four ~1.98"). See buildSowCompact.js.
 * Only the LessonSequence differs; FinalExplanation and SummaryTable are identical.
 */
export type LessonSequenceFormat = 'standard' | 'compact'

/** The ARES sub-strand data object the generator consumes. */
export interface AresDataObject {
  META: unknown
  UNIT: unknown
  LESSONS: unknown[]
  FINAL_EXPLANATION?: unknown
  SUMMARY_TABLE?: unknown
}

/** The three deliverable DOCX as Buffers. FE/ST are null when absent from the bundle. */
export interface GeneratedDocx {
  lessonSequence: Buffer
  finalExplanation: Buffer | null
  summaryTable: Buffer | null
}

/**
 * Generate the three CBE DOCX from an ARES data object, in-process, as Buffers.
 * The Resource column is intentionally empty (aresResources is not vendored).
 *
 * `format` selects the LessonSequence layout (default 'standard' — the pristine
 * vendored path). 'compact' drops Section C's Resource column and re-balances
 * widths. FinalExplanation and SummaryTable are identical for both.
 */
export async function generateBundleDocx(
  data: AresDataObject,
  format: LessonSequenceFormat = 'standard',
): Promise<GeneratedDocx> {
  const { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE } = data
  const buildLessonSequence = format === 'compact' ? buildSoWCompact : buildSoW
  return {
    lessonSequence: await Packer.toBuffer(await buildLessonSequence(META, UNIT, LESSONS)),
    finalExplanation: FINAL_EXPLANATION
      ? await Packer.toBuffer(await buildFinalExplanation(META, FINAL_EXPLANATION))
      : null,
    summaryTable: SUMMARY_TABLE
      ? await Packer.toBuffer(await buildSummaryTable(META, SUMMARY_TABLE))
      : null,
  }
}
