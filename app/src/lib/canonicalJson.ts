/**
 * Key-order-insensitive JSON serialization — the comparator behind save-as-new's no-op guard
 * (2026-07-17): a submission that round-tripped through the client and a doc read from the DB may
 * order object keys differently while carrying identical content, so equality must be tested on a
 * canonical form, never on raw JSON.stringify output.
 *
 * A JSON round-trip first (normalizes Dates to ISO strings, drops undefined-valued keys — exactly
 * what a REST round-trip does), then every object is rebuilt with sorted keys, recursively. Arrays
 * keep their order: element order IS content for lessons/framework rows.
 */
export const canonicalJson = (value: unknown): string => {
  // `JSON.stringify(undefined)` is the value `undefined`, so a naive round-trip would `JSON.parse`
  // that and throw. Map it to a stable sentinel instead — it can never collide with real output
  // (valid JSON text is never the bare word `undefined`), so it compares distinctly from `null`/`{}`.
  if (value === undefined) return 'undefined'
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
          )
        : v
  return JSON.stringify(sort(JSON.parse(JSON.stringify(value))))
}
