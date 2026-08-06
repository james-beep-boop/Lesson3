/**
 * Edit-recovery request-body parsing and validation — split out of `recovery.ts` for the same reason
 * `previewParse.ts` was split out of `previewShared.ts`: these guards are pure HTTP semantics, and
 * keeping them free of the access/kernel/payload-types chain lets them be unit tested in the DB-free
 * unit environment rather than only over the wire. `recovery.ts` re-exports nothing — it imports these
 * directly — so there is one definition, not two.
 *
 * Depends only on `APIError`/`PayloadRequest`.
 */
import { APIError, type PayloadRequest } from 'payload'

/**
 * Coarse ceiling on the WHOLE request body, checked from `Content-Length` BEFORE `req.json()`
 * materialises it.
 *
 * ⚑ This is NOT the 512 KB `MAX_CAPTURE_BYTES` cap, and must not be confused with it. That cap
 * measures the PROJECTED content — what actually reaches the column — and the projection strictly
 * shrinks its input, since it keeps only whitelisted prose fields. A legitimate form document is
 * therefore larger than its own projection, sometimes by a lot, so sizing the raw body at 512 KB
 * would reject captures the storage cap would have accepted.
 *
 * 4 MB is the figure `MAX_PREVIEW_JSON_BYTES` independently arrived at for a posted bundle form-state
 * document, which is the same class of payload reaching a different endpoint — so it is a value
 * chosen for the same reason, NOT a value derived from that one. The two are deliberately separate
 * constants and are free to diverge: preview's ceiling may be tuned for what the generator can afford
 * to render, which has nothing to do with what a capture may post. Do not couple them to remove the
 * duplicate literal; the duplication is the point. The kernel's byte cap remains the authority on
 * what is STORED.
 *
 * ⚑ **What this bounds is the DECLARED length, and nothing more.** It is not a memory bound and must
 * not be described as one. A client that omits `Content-Length` — or sends a chunked body, or simply
 * lies — reaches `req.json()` untouched and can still make the process materialise a body of any
 * size. This guard's whole value is that it makes the honest oversized request cheap; it does nothing
 * whatsoever about the dishonest one.
 *
 * A real ceiling has to be enforced where the bytes actually arrive: a proxy-level body limit, or a
 * streaming read that counts as it consumes and aborts past the cap. The repo has neither today
 * (`docs/NEXT-SESSION.md` records it). Per-user rate limiting bounds how OFTEN a request may arrive
 * and says nothing about how large one may be, so the two together still leave the hard boundary
 * unenforced — they narrow the window, they do not close it.
 */
export const MAX_RECOVERY_BODY_BYTES = 4_000_000

/**
 * Read and JSON-parse a recovery request body, refusing an oversized one before it is buffered.
 *
 * An absent body is `{}` rather than an error: `start` legitimately posts nothing, and the per-field
 * guards below are what reject a body that is present but wrong.
 */
export async function readRecoveryBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  // Pre-parse guard: reject via Content-Length BEFORE `req.json()` reads the stream into memory.
  // `Number(null)` is 0 and `Number('')` is 0, so a missing header falls through to the parse, which
  // is the intended behaviour — see the honesty caveat on the constant.
  const declaredLength = Number(req.headers?.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECOVERY_BODY_BYTES) {
    throw new APIError('Request body too large', 413)
  }

  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    throw new APIError('Invalid JSON body', 400)
  }
}

/**
 * A token field the client echoes back. Rejected rather than coerced — `Number(true)` is 1, so a lax
 * check admits booleans as counters.
 *
 * ⚑ Same predicate as `toPositiveInt` in `lib/txDb.ts`, deliberately not delegating to it: that one
 * throws a bare `Error` because a bad value coming BACK from the driver is an invariant violation
 * (a 500), while a bad value arriving from a client is a 400 with the offending field named. The
 * domains must stay in step — if one widens, so must the other.
 */
export function requireCounter(value: unknown, name: string): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new APIError(`\`${name}\` must be a positive integer`, 400)
  }
  return n
}

/**
 * The capture body's `document`, which must be a PLAIN OBJECT.
 *
 * ⚑ Without this, a missing / null / string / array `document` projected to `{}` and the capture
 * SUCCEEDED — advancing the revision and replacing a good backup with an empty one. A client defect
 * holding a valid token could therefore erase the very work this feature exists to protect, and
 * report success while doing it. An empty OBJECT is still legitimate (a teacher who cleared every
 * field); "no document at all" is not, and is now a 400.
 */
export function requireDocument(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new APIError('`document` must be an object', 400)
  }
  return value as Record<string, unknown>
}

/** The multipart field names `save-as-new` reads the edit-recovery token from. */
export const RECOVERY_GENERATION_FIELD = 'recoveryGeneration'
export const RECOVERY_EXPECTED_REVISION_FIELD = 'recoveryExpectedRevision'

/**
 * The edit-recovery token a `save-as-new` submission may carry — `null` when it carries none.
 *
 * ⚑ **OPTIONAL, and that is the whole reason PR 1 can ship without PR 2.** No client sends this yet.
 * A save with no token keeps the pre-existing behaviour exactly and retires nothing, so the server
 * feature lands without a flag day; once the editor sends the token, retirement becomes mandatory for
 * that save. Optional here means "this deployment may not have a recovery-aware client", NOT "the
 * client may choose whether its unsaved work is cleaned up".
 *
 * ⚑ **Exactly one field is a 400, never a silent no-op.** A client that sends a generation but no
 * revision is broken, and treating it as "no token" would silently leave the capture ACTIVE after a
 * successful save — the user would be offered stale unsaved work they had already saved. The
 * half-token is the signal that something is wrong, so it must be loud.
 *
 * ⚑ **Read from the multipart form, NOT from the bundle document.** Recovery metadata inside `data`
 * would be one admin raw-document edit away from being persisted as lesson content.
 */
export type SaveRecoveryToken = { generation: number; expectedRevision: number } | null

export function readSaveRecoveryToken(form: FormData): SaveRecoveryToken {
  const rawGeneration = form.get(RECOVERY_GENERATION_FIELD)
  const rawRevision = form.get(RECOVERY_EXPECTED_REVISION_FIELD)

  // `null` is "field absent"; an empty string is a client that sent the field with nothing in it,
  // which is the same broken-client signal as omitting one half and must not read as absent.
  const hasGeneration = rawGeneration !== null
  const hasRevision = rawRevision !== null
  if (!hasGeneration && !hasRevision) return null

  if (hasGeneration !== hasRevision) {
    throw new APIError(
      `A recovery token needs BOTH \`${RECOVERY_GENERATION_FIELD}\` and \`${RECOVERY_EXPECTED_REVISION_FIELD}\`, or neither.`,
      400,
    )
  }

  return {
    generation: requireCounter(rawGeneration, RECOVERY_GENERATION_FIELD),
    expectedRevision: requireCounter(rawRevision, RECOVERY_EXPECTED_REVISION_FIELD),
  }
}
