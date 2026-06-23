import { APIError, type PayloadRequest } from 'payload'

import type { LessonSequenceFormat } from '../generator'

/** The export deliverable kind: the generator's DOCX, or that DOCX converted to PDF. */
export type ExportKind = 'docx' | 'pdf'

const searchParams = (req: PayloadRequest): URLSearchParams =>
  new URL(req.url ?? '', 'http://localhost').searchParams

/**
 * Parse + validate the `?format=standard|compact` query param shared by the export and
 * preview endpoints (default `standard`). Throws `APIError(400)` on an unknown value, so
 * the two endpoints can't drift on which formats they accept.
 */
export function parseLessonSequenceFormat(req: PayloadRequest): LessonSequenceFormat {
  const formatParam = searchParams(req).get('format')
  if (formatParam !== null && formatParam !== 'standard' && formatParam !== 'compact') {
    throw new APIError(`Invalid format "${formatParam}" — expected standard|compact`, 400)
  }
  return formatParam === 'compact' ? 'compact' : 'standard'
}

/**
 * Parse + validate the export's `?as=docx|pdf` query param (default `docx`). Lives beside
 * parseLessonSequenceFormat so the export request's two axes — layout (`format`) and
 * deliverable kind (`as`) — share one validation home and can't drift. PDF runs each DOCX
 * through the docxToPdf seam.
 */
export function parseExportKind(req: PayloadRequest): ExportKind {
  const as = searchParams(req).get('as')
  if (as !== null && as !== 'docx' && as !== 'pdf') {
    throw new APIError(`Invalid as "${as}" — expected docx|pdf`, 400)
  }
  return as ?? 'docx'
}
