/**
 * Fake `PayloadRequest` stubs for the DB-free body-guard unit specs.
 *
 * ⚑ WHY SHARED. `reqWith` was written three times — `recoveryParse.spec.ts`, `markReadBody.spec.ts`
 * and (in a `formData` variant) `parsePreviewCandidate.spec.ts`. It is the stub that encodes what
 * `assertDeclaredBodyWithin` actually reads off a request, so when that guard learns anything new —
 * a `transfer-encoding` check, a real `Request` — three stubs need the same edit and one of them has
 * a different shape. Same reasoning as `tests/helpers/renderSql.ts`.
 *
 * Dependency-free on purpose: these are used from `vitest.unit.config.mts` specs, which boot no
 * Payload and open no database.
 */

/** Only what the guards read: a `content-length` header, and a body reader. */
const headersWith = (contentLength?: number) => ({
  get: (k: string) =>
    k === 'content-length' && contentLength != null ? String(contentLength) : null,
})

/** A request whose body arrives as JSON. `contentLength` is omitted to model an absent header. */
export const jsonReq = (json: () => Promise<unknown>, contentLength?: number) =>
  ({ headers: headersWith(contentLength), json }) as never

/** A request whose body arrives as multipart form data. */
export const formReq = (formData: () => Promise<unknown>, contentLength?: number) =>
  ({ headers: headersWith(contentLength), formData }) as never

/**
 * The status an APIError carries, or `undefined` when the call resolved.
 *
 * Kept because the guards throw Payload's `APIError` rather than rejecting with a plain value, and
 * asserting `.status` is what distinguishes a 413 from a 400 that happens to also throw.
 */
export const statusOf = async (run: () => unknown): Promise<number | undefined> => {
  try {
    await run()
    return undefined
  } catch (e) {
    return (e as { status?: number }).status
  }
}
