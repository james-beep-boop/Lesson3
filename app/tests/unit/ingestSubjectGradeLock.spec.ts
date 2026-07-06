/**
 * Ingest subject-grade lock WIRING guard (audit 2026-07-06 #2).
 *
 * Two simultaneous uploads of the same NEW non-empty substrand_id both preflight to "no existing
 * plan" (the preflight lookup runs OUTSIDE the write transaction) and both create Official 1.0.0
 * plans — every later upload of that sub-strand then hits the duplicate-plan ambiguity guard. The
 * fix serializes ingests per subject-grade with `SELECT … FOR UPDATE` inside the write transaction
 * and re-resolves each file's plan post-lock. True concurrency can't be pinned in a unit test
 * (same stance as subjectAdminDemoteLock.spec.ts, the PR #50 sibling this mirrors), so this
 * asserts the WIRING the fix depends on — the right rows, deadlock-free ascending order, the
 * transaction's own connection, graceful no-transaction fallback. If this file goes red, read
 * ingest/index.ts (`lockSubjectGrades`) before "fixing" it.
 */
import { describe, it, expect } from 'vitest'

import type { Payload } from 'payload'

import { lockSubjectGrades } from '../../src/ingest'

type Executed = { via: 'session' | 'drizzle'; text: string; params: number[] }

/** Render a drizzle sql template object (shape verified against the installed package). */
function renderSql(q: unknown): { text: string; params: number[] } {
  const chunks = (q as { queryChunks?: unknown[] }).queryChunks ?? []
  const text = chunks
    .map((c) => {
      const v = (c as { value?: unknown })?.value
      return Array.isArray(v) ? v.join('') : '¶'
    })
    .join('')
  const params = chunks.filter((c): c is number => typeof c === 'number')
  return { text, params }
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
  it('locks each distinct subject-grade row FOR UPDATE, ascending, on the tx connection', async () => {
    const events: Executed[] = []
    await lockSubjectGrades(makePayload(events, 'tx1'), 'tx1', [42, 7, 42, 19])

    expect(events).toHaveLength(3) // deduped
    for (const e of events) {
      expect(e.via).toBe('session') // the transaction's own connection, not the global pool
      expect(e.text).toMatch(/SELECT id FROM "subject_grades" WHERE id = ¶ FOR UPDATE/)
    }
    // Ascending id order — two concurrent batches over overlapping grade sets can't deadlock.
    expect(events.map((e) => e.params[0])).toEqual([7, 19, 42])
  })

  it('falls back to the global connection outside a transaction (harmless no-op lock)', async () => {
    const events: Executed[] = []
    await lockSubjectGrades(makePayload(events), undefined, [5])
    expect(events).toHaveLength(1)
    expect(events[0].via).toBe('drizzle')
  })
})
