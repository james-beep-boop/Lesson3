import { APIError, type PayloadRequest } from 'payload'

// The deliverable kind (docx | pdf) is owned by the generator's export layer — reuse it here rather
// than redefining the union, so the parser and the artifact spec can't drift.
import { DELIVERABLE_TAGS, type DeliverableTag, type ExportKind } from '../generator/exportArtifacts'

export type { ExportKind }

const searchParams = (req: PayloadRequest): URLSearchParams =>
  new URL(req.url ?? '', 'http://localhost').searchParams

/**
 * Parse + validate the export's `?as=docx|pdf` query param (default `docx`) — the sole
 * remaining export axis (the layout/`?format=` axis was removed with the single-document-format
 * collapse, 2026-07-03). PDF runs each DOCX through the docxToPdf seam.
 */
export function parseExportKind(req: PayloadRequest): ExportKind {
  const as = searchParams(req).get('as')
  if (as !== null && as !== 'docx' && as !== 'pdf') {
    throw new APIError(`Invalid as "${as}" — expected docx|pdf`, 400)
  }
  return as ?? 'docx'
}

/**
 * Parse + validate the per-document endpoint's required `?doc=<tag>` query param (teacher-first
 * track T1) — the deliverable-tag axis, owned here beside its `?as=` sibling.
 */
export function parseDeliverableTag(req: PayloadRequest): DeliverableTag {
  const doc = searchParams(req).get('doc')
  if (doc === null || !(DELIVERABLE_TAGS as readonly string[]).includes(doc)) {
    throw new APIError(`Invalid doc "${doc ?? ''}" — expected ${DELIVERABLE_TAGS.join('|')}`, 400)
  }
  return doc as DeliverableTag
}
