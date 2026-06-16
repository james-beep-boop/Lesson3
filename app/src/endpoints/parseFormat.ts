import { APIError, type PayloadRequest } from 'payload'

import type { LessonSequenceFormat } from '../generator'

/**
 * Parse + validate the `?format=standard|compact` query param shared by the export and
 * preview endpoints (default `standard`). Throws `APIError(400)` on an unknown value, so
 * the two endpoints can't drift on which formats they accept.
 */
export function parseLessonSequenceFormat(req: PayloadRequest): LessonSequenceFormat {
  const formatParam = new URL(req.url ?? '', 'http://localhost').searchParams.get('format')
  if (formatParam !== null && formatParam !== 'standard' && formatParam !== 'compact') {
    throw new APIError(`Invalid format "${formatParam}" — expected standard|compact`, 400)
  }
  return formatParam === 'compact' ? 'compact' : 'standard'
}
