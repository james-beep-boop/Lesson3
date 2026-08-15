/**
 * Ingest subject-grade lock WIRING guard (audit 2026-07-06 #2).
 *
 * Two simultaneous uploads of the same NEW non-empty substrand_id both preflight to "no existing
 * plan" (the preflight lookup runs OUTSIDE the write transaction) and both create Official 1.0.0
 * plans — every later upload of that sub-strand then hits the duplicate-plan ambiguity guard. The
 * fix serializes ingests per subject-grade with `SELECT … FOR UPDATE` inside the write transaction
 * and re-resolves each file's plan post-lock. True concurrency can't be pinned in a unit test
 * (same stance as subjectAdminDemoteLock.spec.ts, the PR #50 sibling this mirrors), so this
 * asserts the WIRING the fix depends on — the right rows, deadlock-free ascending order, and the
 * transaction's own connection. If this file goes red, read `lib/txDb.ts` (`lockRows`) and
 * ingest/index.ts (`lockSubjectGrades`) before "fixing" it.
 *
 * ⚑ THIS FILE USED TO ASSERT THE BUG. Its second case required a "graceful no-transaction fallback"
 * to the global pool and called the result a "harmless no-op lock" — but a `FOR UPDATE` on a pooled
 * connection is released the moment the statement returns, so that path serialised NOTHING while
 * ingest carried on as though it had. The behaviour is now a refusal, and the case below asserts the
 * refusal. A test can pin a defect in place as effectively as it pins a feature; this one did, for
 * three call sites.
 */
import { describe, it, expect } from 'vitest'

import type { Payload } from 'payload'

import { lockSubjectGrades } from '../../src/ingest'

type Executed = { via: 'session' | 'drizzle'; text: string; params: number[] }

/**
 * Render a drizzle sql template object.
 *
 * RECURSIVE, because `lockRows` composes its statement from nested `SQL` objects — `sql.raw` for the
 * table identifier and `sql.join` for the bound id list — rather than one flat chunk list. A
 * non-recursive reader sees those as opaque placeholders and reports an empty parameter list, which
 * looks exactly like "the lock bound nothing". Shape verified against the installed package.
 */
function renderSql(q: unknown): { text: string; params: number[] } {
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

function makePayload(events: Executed[], transactionID?: string): Payload {
  return {
    db: {
      sessions: transactionID
        ? {
            [transactionID]: {
              db: {
                execute: (q: unknown) => {
                  events.push({ via: 'session', ...renderSql(q) })
                  return Promise.resolve()
                },
              },
            },
          }
        : {},
      drizzle: {
        execute: (q: unknown) => {
          events.push({ via: 'drizzle', ...renderSql(q) })
          return Promise.resolve()
        },
      },
    },
  } as unknown as Payload
}

describe('lockSubjectGrades wiring', () => {
  it('locks the distinct subject-grade rows FOR UPDATE, ascending, on the tx connection', async () => {
    const events: Executed[] = []
    await lockSubjectGrades(makePayload(events, 'tx1'), 'tx1', [42, 7, 42, 19])

    // ONE statement now, not one per id: `lockRows` locks the whole set in a single round trip.
    expect(events).toHaveLength(1)
    expect(events[0].via).toBe('session') // the transaction's own connection, not the global pool
    expect(events[0].text).toContain('"subject_grades"')
    expect(events[0].text).toContain('FOR UPDATE')
    // ORDER BY is what makes the acquisition order ascending inside a single statement — two
    // concurrent batches over overlapping grade sets queue instead of deadlocking.
    expect(events[0].text).toContain('ORDER BY id')
    // Deduped and sorted before binding.
    expect(events[0].params).toEqual([7, 19, 42])
  })

  it('REFUSES to lock outside a transaction rather than running on the pool', async () => {
    const events: Executed[] = []
    await expect(lockSubjectGrades(makePayload(events), undefined, [5])).rejects.toThrow(
      /must run inside the caller’s transaction/i,
    )
    expect(events, 'nothing may reach the database on the refusing path').toHaveLength(0)
  })
})
