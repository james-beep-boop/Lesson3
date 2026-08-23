/**
 * The FIELD-LEVEL messages of a rejected Payload write.
 *
 * ⚑ `rejects.toThrow(/…/)` is the wrong tool for a Payload `ValidationError`: its top-level `message`
 * is the generic "The following field is invalid: publicSlug" (untranslated, `error:…`, when `req.t`
 * is a stub), and the message the hook actually wrote — the one an administrator reads, and the only
 * thing that distinguishes "you may not rename this" from "that slug is malformed" — lives in
 * `data.errors[].message`. Matching the wrapper would pass for ANY validation failure on that field,
 * including one from a future rule, so this reaches for the real text and the path alongside it.
 *
 * It THROWS rather than returning a sentinel when the write succeeded or produced no field errors:
 * "expected the write to be rejected" is a legible failure, where a sentinel string turns into a
 * confusing regex mismatch two lines later.
 *
 * ⚑ Extracted here (2026-08-23) from `tests/int/publicPublication.int.spec.ts`, which wrote it first,
 * when a second spec needed it — the same trajectory `fakeReq.ts` records. Dependency-free on purpose,
 * so the DB-free `test:unit` config can import it as happily as `test:int`.
 */
export async function fieldErrors(
  op: Promise<unknown>,
): Promise<{ message: string; path: string }[]> {
  try {
    await op
  } catch (error) {
    const data = (error as { data?: { errors?: { message?: string; path?: string }[] } }).data
    const errors = data?.errors ?? []
    if (errors.length === 0) {
      throw new Error(`expected field-level errors, got: ${String((error as Error).message)}`)
    }
    return errors.map((e) => ({ message: String(e.message ?? ''), path: String(e.path ?? '') }))
  }
  throw new Error('expected the write to be rejected, but it succeeded')
}
