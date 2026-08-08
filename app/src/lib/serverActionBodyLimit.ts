/**
 * The Server Action request-body ceiling, and the measurement it is derived from.
 *
 * ⚑ **This fixes a PRE-EXISTING editor defect, not an edit-recovery one.** Payload debounces an
 * `onChange` that posts the FULL form state to a Next.js Server Action. Next's default ceiling is
 * `bytes('1mb')` = 1,048,576 B and `next.config.ts` set none, so typing one character into a large
 * lesson plan 500s:
 *
 * ```text
 * POST /admin/collections/lesson-bundle-versions/13 → 500   Error: Body exceeded 1 MB limit
 * ```
 *
 * Saving still worked, because save-as-new posts multipart to a REST endpoint rather than a Server
 * Action. What failed was Payload's own form-state sync — so field-level validation and conditional
 * logic silently stopped updating while the user typed. That is why nobody reported it: it is
 * invisible unless you have the console open.
 *
 * ## The measurement
 *
 * Version 13 (13 lessons, the largest shape in the corpus), measured 2026-08-07: raw document
 * **618,518 B**, Server Action body **1,587,513 B**. That is **2.57× the document**, and 51.4% over
 * the ceiling. ⚑ Exact bytes on purpose — an earlier write-up of this recorded them as "0.59 MB" and
 * "1.51 MB" (MiB values mislabelled), divided by 1,000,000, and reported the overshoot as 59%.
 *
 * ## Why 12 MiB and not 4 MB
 *
 * Both were defensible. 4 MB covers today's corpus with ~2.6× headroom over the largest body seen.
 * It was rejected because it makes the app INCOHERENT: {@link MAX_EDITABLE_DOCUMENT_BYTES} is the
 * ceiling the save and preview paths already accept, so a 4 MB Server Action limit would mean
 * documents this system will happily STORE cannot be EDITED — and the failure would be the same
 * silent one, hitting exactly the largest and most valuable plans.
 *
 * The requirement is therefore derived from the document ceiling, not from today's corpus:
 * 4,000,000 B × 2.57 ≈ **10,280,000 B of form state**. That is a MEASURED REQUIREMENT. 12 MiB
 * (12,582,912 B) is a headroom POLICY on top of it — about 22% — chosen so the limit is not itself
 * the next thing to tune.
 *
 * ⚑ **It raises the ceiling for EVERY Server Action in the app**, which is why it is a deliberate
 * production-posture decision rather than a copied constant. The exposure is bounded by what already
 * bounds those routes: Server Actions are POST-only to the authenticated admin surface, and the app's
 * own upload/preview/recovery endpoints keep their own, much smaller, independent ceilings.
 */

/**
 * The largest document the app already accepts on the paths that STORE one — `MAX_PREVIEW_JSON_BYTES`
 * and `MAX_RECOVERY_BODY_BYTES` are both this value, independently chosen.
 *
 * ⚑ Restated rather than imported, deliberately: `next.config.ts` is loaded by Next's own config
 * pipeline before the app's module graph exists, and pulling an endpoint module into it would drag
 * Payload's access layer along with it. The DRIFT that restating risks is what
 * `tests/unit/serverActionBodyLimit.spec.ts` exists to catch — it imports both and asserts they agree.
 */
export const MAX_EDITABLE_DOCUMENT_BYTES = 4_000_000

/**
 * How much Server Action body one byte of document costs, measured (1,587,513 / 618,518 = 2.5666…).
 *
 * ⚑ Rounded UP. Rounding DOWN shrinks {@link REQUIRED_BODY_BYTES}, which makes the requirement easier
 * to clear — it FLATTERS the limit. An earlier version of this used 2.56 and its comment claimed the
 * opposite effect, which is the same direction-of-rounding error that once turned this feature's
 * 51.4% overshoot into "59%". When a constant exists to make a check strict, round the way that keeps
 * it strict.
 */
export const FORM_STATE_MULTIPLIER = 2.57

/** The measured requirement: what the largest acceptable document implies. ~10.28 MB. */
export const REQUIRED_BODY_BYTES = MAX_EDITABLE_DOCUMENT_BYTES * FORM_STATE_MULTIPLIER

/**
 * The configured ceiling, in the form Next parses with `bytes` — so `mb` here is MiB (1024²),
 * matching Next's own default of `bytes('1mb')`.
 */
export const SERVER_ACTION_BODY_LIMIT = '12mb'

/** The same value in bytes, for the test that checks it clears {@link REQUIRED_BODY_BYTES}. */
export const SERVER_ACTION_BODY_LIMIT_BYTES = 12 * 1024 * 1024
