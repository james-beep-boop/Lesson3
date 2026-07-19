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
/**
 * Per-deliverable builders, each generating ONE DOCX (the primary always exists; FE/ST return null
 * when the bundle has no such content — matching `GeneratedDocx`'s null contract). Split out so a
 * caller that consumes a single deliverable — the editor's "View as PDF" preview — need not build and
 * discard the other two, and so each deliverable has ONE build definition that `generateBundleDocx`
 * and `generateDeliverableDocx` both compose.
 */
export async function generateLessonSequenceDocx(data: AresDataObject): Promise<Buffer> {
  const { META, UNIT, LESSONS } = data
  return Packer.toBuffer(await buildSoWCompact(META, UNIT, LESSONS))
}

export async function generateFinalExplanationDocx(data: AresDataObject): Promise<Buffer | null> {
  const { META, FINAL_EXPLANATION } = data
  return FINAL_EXPLANATION ? Packer.toBuffer(await buildFinalExplanation(META, FINAL_EXPLANATION)) : null
}

export async function generateSummaryTableDocx(data: AresDataObject): Promise<Buffer | null> {
  const { META, SUMMARY_TABLE } = data
  return SUMMARY_TABLE ? Packer.toBuffer(await buildSummaryTable(META, SUMMARY_TABLE)) : null
}

export async function generateBundleDocx(data: AresDataObject): Promise<GeneratedDocx> {
  return {
    lessonSequence: await generateLessonSequenceDocx(data),
    finalExplanation: await generateFinalExplanationDocx(data),
    summaryTable: await generateSummaryTableDocx(data),
  }
}

/**
 * The per-deliverable builder for each `GeneratedDocx` key. Typing it `Record<keyof GeneratedDocx, …>`
 * makes it COMPILE-TIME exhaustive: adding a deliverable to `GeneratedDocx` fails to type-check until a
 * builder is registered here — no runtime `default`/`throw` scaffolding needed.
 */
const DELIVERABLE_BUILDERS: Record<keyof GeneratedDocx, (data: AresDataObject) => Promise<Buffer | null>> = {
  lessonSequence: generateLessonSequenceDocx,
  finalExplanation: generateFinalExplanationDocx,
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
