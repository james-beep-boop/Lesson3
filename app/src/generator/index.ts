/**
 * Lesson3 ⇄ ARES generator integration.
 *
 * The generator under `vendor/` is CommonJS and byte-pristine (see vendor/PROVENANCE.md).
 * We import its builders via createRequire (the app is ESM / "type":"module") and wrap
 * them to return in-memory Buffers — no disk writes, no Python, no edits to vendored code.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildFinalExplanation, buildSummaryTable } =
  require('./vendor/lib/build_docs.js') as {
    buildFinalExplanation: (META: unknown, FE: unknown) => Promise<unknown>
    buildSummaryTable: (META: unknown, ST: unknown) => Promise<unknown>
  }
const { buildSoWCompact } =
  require('./buildSowCompact.cjs') as {
    buildSoWCompact: (META: unknown, UNIT: unknown, LESSONS: unknown) => Promise<unknown>
  }
const { Packer } = require('docx') as { Packer: { toBuffer: (doc: unknown) => Promise<Buffer> } }

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
 *
 * There is ONE document format (decided 2026-07-03): Section C ("Lesson Implementation
 * Framework") is the five-column layout with NO separate Resource column — `buildSoWCompact`.
 * (The vendored six-column `buildSoW`, which carried an always-empty Resource column, is retired
 * and left byte-pristine but unused in vendor/.) Resource LINKS, when ARES data lands, will render
 * inline in the phase rows — a later, separate concern. FinalExplanation and SummaryTable are
 * unchanged.
 */
export async function generateBundleDocx(data: AresDataObject): Promise<GeneratedDocx> {
  const { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE } = data
  return {
    lessonSequence: await Packer.toBuffer(await buildSoWCompact(META, UNIT, LESSONS)),
    finalExplanation: FINAL_EXPLANATION
      ? await Packer.toBuffer(await buildFinalExplanation(META, FINAL_EXPLANATION))
      : null,
    summaryTable: SUMMARY_TABLE
      ? await Packer.toBuffer(await buildSummaryTable(META, SUMMARY_TABLE))
      : null,
  }
}
