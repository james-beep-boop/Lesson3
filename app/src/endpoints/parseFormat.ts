import { APIError, type PayloadRequest } from 'payload'

// The deliverable kind (docx | pdf) is owned by the generator's export layer — reuse it here rather
// than redefining the union, so the parser and the artifact spec can't drift.
import type { ExportKind } from '../generator/exportArtifacts'

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
