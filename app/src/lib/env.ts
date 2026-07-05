/**
 * Shared environment-variable parsing helpers.
 *
 * The house rule for numeric config (SPEC §11 / audit 2026-07-04): FAIL FAST on a malformed value
 * rather than the `Number(env) || default` idiom, which silently swallows `0` / `NaN` / garbage back
 * to the default — so an operator who sets `RATE_LIMIT_EXPORT_MAX=0` (intending a lockdown) or
 * fat-fingers `ARTIFACT_CACHE_MAX_BYTES` would unknowingly get the generous default. Unset → the
 * default; set-but-not-a-positive-integer → throw at boot, loud, like the empty-PAYLOAD_SECRET guard.
 */

/** Read a positive-integer env override, or the fallback when unset; throw on a malformed value. */
export const positiveIntEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer (got "${raw}")`)
  }
  return n
}
