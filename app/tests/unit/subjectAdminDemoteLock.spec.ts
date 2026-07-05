/**
 * Subject-Admin grant-lock WIRING guard (Codex 2026-07-05 #3 / Bucket A #10, Phase 5 A2).
 *
 * "≤1 Subject Admin per subject-grade" is enforced procedurally by `autoDemotePriorSubjectAdmins`,
 * which had a read-then-write race: two transactions granting DIFFERENT users the same grade each
 * scan before the other commits, neither demotes, both commit → two Subject Admins. The fix
 * serializes grants with a `SELECT … FOR UPDATE` on the granted subject_grades rows BEFORE the
 * scan (tx-bound connection, mirroring endpoints/userAssignments.ts). True concurrency can't be
 * pinned in a unit test, so this asserts the WIRING the fix depends on — lock present, on the
 * right rows, in deadlock-free order, BEFORE the scan, on the transaction's own connection — plus
 * the pagination of the demote scan (the old single find silently capped at 1000 users). If this
 * file goes red, read hooks/userRoles.ts before "fixing" it.
 */
import { describe, it, expect } from 'vitest'

import { Users } from '../../src/collections/Users'
import { autoDemotePriorSubjectAdmins } from '../../src/hooks/userRoles'

type Event =
  | { type: 'lock'; via: 'session' | 'drizzle'; text: string; params: number[] }
  | { type: 'find'; sgId: unknown; page: unknown }
  | { type: 'demote'; userId: number; assignments: unknown }

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

function makeHarness(opts: {
  transactionID?: string
  pagesBySg?: Record<number, { docs: unknown[]; hasNextPage: boolean }[]>
}) {
  const events: Event[] = []
  const makeExecute = (via: 'session' | 'drizzle') => (q: unknown) => {
    events.push({ type: 'lock', via, ...renderSql(q) })
    return Promise.resolve([])
  }
  const pageCursors: Record<number, number> = {}
  const req = {
    transactionID: opts.transactionID,
    payload: {
      db: {
        sessions: opts.transactionID
          ? { [opts.transactionID]: { db: { execute: makeExecute('session') } } }
          : undefined,
        drizzle: { execute: makeExecute('drizzle') },
      },
      find: (args: {
        where: { and: { 'assignments.subjectGrade'?: { equals: number } }[] }
        page?: number
      }) => {
        const sgId = args.where.and.find((c) => c['assignments.subjectGrade'])?.[
          'assignments.subjectGrade'
        ]?.equals as number
        events.push({ type: 'find', sgId, page: args.page })
        const pages = opts.pagesBySg?.[sgId] ?? [{ docs: [], hasNextPage: false }]
        const idx = pageCursors[sgId] ?? 0
        pageCursors[sgId] = idx + 1
        return Promise.resolve(pages[Math.min(idx, pages.length - 1)])
      },
      update: (args: { id: number; data: { assignments: unknown } }) => {
        events.push({ type: 'demote', userId: args.id, assignments: args.data.assignments })
        return Promise.resolve({})
      },
    },
  }
  return { events, req }
}

const run = (args: unknown) =>
  (autoDemotePriorSubjectAdmins as unknown as (a: unknown) => Promise<unknown>)(args)

describe('subject-admin grant lock wiring', () => {
  it('autoDemotePriorSubjectAdmins is wired into Users afterChange', () => {
    expect(Users.hooks?.afterChange).toContain(autoDemotePriorSubjectAdmins)
  })

  it('locks every granted subject-grade FOR UPDATE, ascending, BEFORE any scan, on the tx connection', async () => {
    const { events, req } = makeHarness({ transactionID: 't1' })
    await run({
      req,
      context: {},
      doc: {
        id: 1,
        assignments: [
          { subjectGrade: 7, role: 'subjectAdmin' },
          { subjectGrade: 3, role: 'subjectAdmin' },
          { subjectGrade: 9, role: 'editor' }, // editor rows must NOT be locked
        ],
      },
    })

    const locks = events.filter((e) => e.type === 'lock')
    expect(locks.map((l) => l.params)).toEqual([[3], [7]]) // ascending → deadlock-free
    for (const l of locks) {
      expect(l.text).toContain('"subject_grades"')
      expect(l.text).toContain('FOR UPDATE')
      expect(l.via).toBe('session') // the TRANSACTION's connection, not the global pool
    }
    const firstFind = events.findIndex((e) => e.type === 'find')
    const lastLock = events.map((e) => e.type).lastIndexOf('lock')
    expect(firstFind).toBeGreaterThan(lastLock) // every lock precedes every scan
  })

  it('falls back to the global drizzle connection when no transaction exists', async () => {
    const { events, req } = makeHarness({})
    await run({
      req,
      context: {},
      doc: { id: 1, assignments: [{ subjectGrade: 5, role: 'subjectAdmin' }] },
    })
    expect(events.filter((e) => e.type === 'lock').map((l) => l.via)).toEqual(['drizzle'])
  })

  it('paginates the demote scan and demotes subjectAdmin rows of others on every page', async () => {
    const { events, req } = makeHarness({
      transactionID: 't1',
      pagesBySg: {
        3: [
          {
            docs: [{ id: 2, assignments: [{ subjectGrade: 3, role: 'subjectAdmin' }] }],
            hasNextPage: true,
          },
          {
            docs: [
              { id: 4, assignments: [{ subjectGrade: 3, role: 'editor' }] }, // not a holder → untouched
              { id: 5, assignments: [{ subjectGrade: 3, role: 'subjectAdmin' }] },
            ],
            hasNextPage: false,
          },
        ],
      },
    })
    await run({
      req,
      context: {},
      doc: { id: 1, assignments: [{ subjectGrade: 3, role: 'subjectAdmin' }] },
    })

    expect(events.filter((e) => e.type === 'find')).toHaveLength(2) // both pages fetched
    const demotes = events.filter((e) => e.type === 'demote')
    expect(demotes.map((d) => d.userId)).toEqual([2, 5]) // page-2 holder found despite page 1
    expect(demotes[0].assignments).toEqual([{ subjectGrade: 3, role: 'editor' }])
  })

  it('does nothing (no lock, no scan) when skipping or when nothing grants subjectAdmin', async () => {
    const skip = makeHarness({ transactionID: 't1' })
    await run({
      req: skip.req,
      context: { skipAutoDemote: true },
      doc: { id: 1, assignments: [{ subjectGrade: 3, role: 'subjectAdmin' }] },
    })
    expect(skip.events).toHaveLength(0)

    const editorOnly = makeHarness({ transactionID: 't1' })
    await run({
      req: editorOnly.req,
      context: {},
      doc: { id: 1, assignments: [{ subjectGrade: 3, role: 'editor' }] },
    })
    expect(editorOnly.events).toHaveLength(0)
  })
})
