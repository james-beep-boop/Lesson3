/**
 * Whether a stored capture may still be APPLIED to its source (SPEC §5) — one definition, used by
 * the restore prompt's GET endpoint and by Manage's "Your Drafts" list, so the list never
 * offers Resume on a capture the editor will then show as copy-only, or the reverse.
 *
 * Pure and import-free, so `lib` does not reach into `endpoints` for the constant.
 */

/** The schema shape a capture was taken under. Bumped when the prose field set changes. */
export const CAPTURE_SCHEMA_VERSION = 'v1'

/**
 * `stale`: the source moved since the session began. `schemaMismatch`: the field shape changed.
 * Either one means view/copy/discard only — the capture must never be applied.
 */
export const captureProvenance = (
  capture: { baseUpdatedAt: string; schemaVersion: string },
  sourceUpdatedAt: unknown,
): { stale: boolean; schemaMismatch: boolean } => {
  // ⚑ A `Date` is used as-is: `String(date)` renders without milliseconds, so stringifying first
  // would make every capture read as stale. Payload hands `updatedAt` over as an ISO string today;
  // this is the same defence `tokenOf` in the kernel applies, for the same reason.
  const source =
    sourceUpdatedAt instanceof Date ? sourceUpdatedAt : new Date(String(sourceUpdatedAt))
  return {
    stale: capture.baseUpdatedAt !== source.toISOString(),
    schemaMismatch: capture.schemaVersion !== CAPTURE_SCHEMA_VERSION,
  }
}
