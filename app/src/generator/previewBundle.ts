/**
 * Draft-capable CONTENT PREVIEW for a bundle — the generated DOCX rendered to HTML
 * (SPEC §5 preview tier). Used by the admin editor preview so an editor can see what
 * their (saved) edits produce *before* publishing.
 *
 * This is deliberately NOT `generateForBundle`:
 *   - NO published/exportable gate — it renders whatever snapshot it is given, including
 *     an in-progress DRAFT. The caller is responsible for authorization (the preview
 *     endpoint enforces the caller's READ access first, exactly like the export endpoint).
 *   - HTML ONLY — it never returns DOCX bytes, so it can never be an export bypass. The
 *     output is mammoth's content+table HTML (styling/colour dropped); our prose fields are
 *     plain strings with no inline markup, so mammoth escapes all text into text nodes and
 *     the result carries no executable markup (same basis as the teacher content view).
 *
 * It takes an already-loaded bundle (the endpoint loads it access-gated) — no reload here.
 */
import mammoth from 'mammoth'

import { bundleToAresData } from './adapter'
import { generateBundleDocx, type GeneratedDocx, type LessonSequenceFormat } from './index'
import type { LessonBundle } from '../payload-types'

export interface PreviewSection {
  label: string
  html: string
}

/**
 * Convert a generated bundle's present documents to content-HTML sections — the
 * LessonSequence always, FinalExplanation / SummaryTable only when the bundle produced
 * them. Shared by the admin editor preview (`renderBundlePreview`) and the teacher
 * content view, so the "which documents, in what order, mammoth-converted" rule lives
 * in one place.
 */
export async function docxToSections(docx: GeneratedDocx): Promise<PreviewSection[]> {
  const docs: { label: string; buffer: Buffer | null }[] = [
    { label: 'Lesson Sequence', buffer: docx.lessonSequence },
    { label: 'Final Explanation', buffer: docx.finalExplanation },
    { label: 'Summary Table', buffer: docx.summaryTable },
  ]
  return Promise.all(
    docs
      .filter((d): d is { label: string; buffer: Buffer } => d.buffer !== null)
      .map(async ({ label, buffer }) => ({
        label,
        html: (await mammoth.convertToHtml({ buffer })).value,
      })),
  )
}

/**
 * Render a (possibly draft) bundle's documents to content HTML. May throw if the
 * snapshot is too incomplete for the generator (an editor previewing a partial draft) —
 * callers should surface that as a "not ready to preview yet" message, not a 500.
 */
export async function renderBundlePreview(
  bundle: LessonBundle,
  format: LessonSequenceFormat = 'standard',
): Promise<PreviewSection[]> {
  return docxToSections(await generateBundleDocx(bundleToAresData(bundle), format))
}
