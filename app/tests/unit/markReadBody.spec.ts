/**
 * The mark-read raw-body ceiling and id coercion (`src/endpoints/markMessagesRead.ts`).
 *
 * WHY THE CEILING EXISTS. `parseIds` caps the ids at 500, which bounds what the endpoint USES — it
 * does nothing about what it READS. Before the guard, `req.json()` buffered whatever arrived before
 * a single element was inspected, and nothing else bounded it: Next's App Router route handlers
 * impose no default body limit, `src/middleware.ts` only sets CSP, and this endpoint declares no
 * rate bucket, so the request was repeatable without limit.
 *
 * ⚑ THE LOAD-BEARING ASSERTION IS THAT THE BODY IS NEVER READ. A 413 returned after `req.json()`
 * had already materialised the payload would have cost exactly the memory the guard exists to
 * refuse, while looking correct from the outside — the same trap `recoveryParse.spec.ts` pins for
 * its own ceiling.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'

import {
  MAX_MARK_READ_BODY_BYTES,
  parseIds,
  readMarkReadIds,
} from '../../src/endpoints/markMessagesRead.js'
import { jsonReq, statusOf } from '../helpers/fakeReq.js'

describe('readMarkReadIds — the raw-body ceiling', () => {
  it('413s when Content-Length exceeds the cap, WITHOUT reading the body', async () => {
    let read = false
    const req = jsonReq(async () => {
      read = true
      return { ids: [1] }
    }, MAX_MARK_READ_BODY_BYTES + 1)

    expect(await statusOf(() => readMarkReadIds(req))).toBe(413)
    expect(read, 'the body must never be read once the header disqualifies it').toBe(false)
  })

  it('allows a body exactly AT the cap', async () => {
    const req = jsonReq(async () => ({ ids: [7] }), MAX_MARK_READ_BODY_BYTES)
    await expect(readMarkReadIds(req)).resolves.toEqual([7])
  })

  it('parses normally when the header is absent — declaring a length is not a requirement', async () => {
    const req = jsonReq(async () => ({ ids: [3, 1, 2] }))
    await expect(readMarkReadIds(req)).resolves.toEqual([3, 1, 2])
  })

  it('is empty, never a throw, when the body cannot be read at all', async () => {
    const req = jsonReq(async () => {
      throw new Error('malformed JSON')
    })
    await expect(readMarkReadIds(req)).resolves.toEqual([])
  })
})

/**
 * Asserted directly rather than through a fake request: these are `parseIds`' own rules and have
 * nothing to do with the ceiling above. The wire suite already covers `[]` and a non-array `ids`
 * reaching the endpoint as `updated: 0`; the dedupe and the 500 cap were covered nowhere.
 */
describe('parseIds — coercion of an untrusted list', () => {
  it('drops non-integers, zero and negatives, and dedupes', () => {
    expect(parseIds([5, 5, 0, -2, 1.5, 'x', null, undefined, 9])).toEqual([5, 9])
  })

  it('caps the list at 500 even when far more are sent', () => {
    expect(parseIds(Array.from({ length: 2000 }, (_, i) => i + 1))).toHaveLength(500)
  })

  it('is empty for anything that is not an array', () => {
    expect(parseIds(undefined)).toEqual([])
    expect(parseIds('nope')).toEqual([])
  })
})
