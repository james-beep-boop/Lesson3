/**
 * The custom endpoints' shared HTTP edges: how a response goes out (`json`) and how an untrusted
 * request body comes in (`assertDeclaredBodyWithin`, `readJsonBody`) — one definition instead of a
 * copy per endpoints file.
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

/**
 * The ceiling for a CONTROL body: a fixed-shape object of a handful of scalars that names an entity
 * and, sometimes, the state the caller believes it is acting on (`{ to }`, `{ subjectGradeId,
 * expectedUpdatedAt }`). Nothing user-authored, nothing list-shaped — those endpoints size their own
 * ceiling against their own worst case, as `MAX_MARK_READ_BODY_BYTES` and `MAX_RECOVERY_BODY_BYTES`
 * do.
 *
 * ⚑ Shared deliberately, and NOT in contradiction of `recoveryParse.ts`'s "do not couple the
 * duplicate literal" note. That note refuses to couple two 4 MB constants that were derived
 * INDEPENDENTLY, for different payload classes, and are free to diverge. These call sites are one
 * payload class with one rationale, so a shared constant is what keeps them honest — the next
 * control endpoint should inherit the number, not re-guess it.
 *
 * 16 KiB against a legitimate worst case in the low hundreds of bytes. `forgotPassword.ts` arrived at
 * the same figure for the same shape before this existed; it is left holding its own copy under the
 * don't-refactor-stable-code rule, not because its case differs.
 */
export const MAX_CONTROL_BODY_BYTES = 16 * 1024

/**
 * Read a JSON request body with a declared-size ceiling — the DEFAULT way an endpoint should touch
 * `req.json()`, and the reason this exists rather than four hand-rolled copies.
 *
 * ⚑ THE GUARD IS THE POINT, AND IT IS ONLY A DEFAULT IF IT IS UNAVOIDABLE. Every ceiling in this repo
 * was opt-in until now: an author had to know to call `assertDeclaredBodyWithin`, and the two most
 * recent JSON endpoints (`emailVersion`, `userAssignments`) simply did not — for a year, and through
 * an audit. `markMessagesRead.ts` even carried a hand-written survey of which siblings were guarded,
 * and that survey was WRONG when it was written. Folding the ceiling into the read is what makes
 * "no request may make the process allocate an unbounded body" hold by construction for the next
 * endpoint, whose author will reach for the obvious reader (`docs/NEXT-SESSION.md`).
 *
 * ⚑ AN OVERSIZED BODY MUST NEVER BE READ. `assertDeclaredBodyWithin` runs BEFORE `req.json()`, so a
 * 413 costs nothing; a 413 returned after the parse would have spent exactly the memory the guard
 * exists to refuse while looking correct from the outside. The unit specs assert the body reader was
 * never called, not merely the status.
 *
 * Returns `null` — never throws — for a body that is absent, unparseable, or on a request with no
 * `json()` at all. That is deliberate: the caller's own field checks then produce a 400 that NAMES
 * the missing field, which is a better answer than "Invalid JSON body". `recoveryParse.ts` and
 * `forgotPassword.ts` want the stricter contract and keep their own reads; both are already guarded,
 * so nothing is left unbounded by that choice.
 *
 * `try`/`catch` rather than `.catch()`: a `json()` that throws SYNCHRONOUSLY would escape a rejection
 * handler, and the three hand-rolled copies this replaces all had that hole.
 */
export async function readJsonBody<T>(
  req: Pick<PayloadRequest, 'headers' | 'json'>,
  maxBytes: number,
  message = 'Request body too large',
): Promise<T | null> {
  assertDeclaredBodyWithin(req, maxBytes, message)
  if (typeof req.json !== 'function') return null
  try {
    return ((await req.json()) ?? null) as T | null
  } catch {
    return null
  }
}
