/**
 * Shared JSON Response helper for the custom endpoints (save-as-new / make-official / export /
 * assignment endpoints) — one definition instead of a copy per endpoints file.
 */
import { APIError, type PayloadRequest } from 'payload'

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Cheap pre-parse rejection for an honestly declared oversized request. This is defense in depth,
 * not the hard boundary: an absent/false Content-Length or chunked body must be stopped by the
 * public reverse proxy (docs/OPS.md).
 */
export function assertDeclaredBodyWithin(
  req: Pick<PayloadRequest, 'headers'>,
  maxBytes: number,
  message: string,
): void {
  const declaredLength = Number(req.headers?.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new APIError(message, 413)
  }
}
