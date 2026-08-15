/**
 * Render a drizzle `sql` template object to its text and bound parameters, for wiring specs.
 *
 * ⚑ RECURSIVE, and that is the whole point. `lockRows` composes its statement from NESTED `SQL`
 * objects — `sql.raw` for the table identifier, `sql.join` for the bound id list — rather than one
 * flat chunk list. A non-recursive reader sees those as opaque placeholders and reports an EMPTY
 * parameter list, which looks exactly like "the lock bound nothing". A test harness that can produce
 * a confident wrong answer about the precise property it exists to verify is worse than none, and
 * this one did: the flat version was rewritten in two specs on the same day for that reason.
 *
 * ⚑ DEPENDENCY-FREE ON PURPOSE. It operates on `unknown` and imports nothing, so it is usable from
 * `vitest.unit.config.mts` specs, which deliberately boot no Payload and open no database. Putting
 * it in `tests/helpers/db.ts` would drag `@payloadcms/db-postgres` into that config.
 *
 * The shape (`queryChunks`, `StringChunk.value`) is a drizzle internal, verified against the
 * installed package. It is the price of asserting on statements without a database; the SEMANTICS of
 * those statements are pinned for real in `tests/int/lockRows.int.spec.ts`.
 */
export interface RenderedSql {
  text: string
  params: number[]
}

export function renderSql(q: unknown): RenderedSql {
  const text: string[] = []
  const params: number[] = []

  const walk = (node: unknown): void => {
    if (node == null) return
    if (typeof node === 'number') {
      params.push(node)
      text.push('¶')
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object') {
      const chunks = (node as { queryChunks?: unknown[] }).queryChunks
      if (chunks) {
        chunks.forEach(walk)
        return
      }
      const value = (node as { value?: unknown }).value
      if (Array.isArray(value)) {
        text.push(value.join(''))
        return
      }
      if (typeof value === 'number') {
        params.push(value)
        text.push('¶')
      }
    }
  }

  walk(q)
  return { text: text.join(''), params }
}
