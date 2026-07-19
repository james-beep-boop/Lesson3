/**
 * Test/gate helper: recursively stamp a synthetic `id` onto every object inside an array, mirroring
 * how Payload injects a row id on each array element. DB-free gates use this to build a "stored"
 * bundle shape from raw ingest output so they can prove the adapter strips those ids (no id leak into
 * generator input). The exact id values are irrelevant — only their presence — so a shared
 * monotonic counter is fine (each gate runs as its own process).
 */
let row = 0

export function withRowIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const mapped = withRowIds(item)
      return mapped && typeof mapped === 'object' && !Array.isArray(mapped)
        ? { id: `row-${++row}`, ...mapped }
        : mapped
    })
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withRowIds(item)]))
  }
  return value
}
