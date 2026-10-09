/**
 * The forum's shared rules (`src/lib/discussions.ts`) and the immutability guard
 * (`src/hooks/discussions.ts`) — the parts that need no database.
 *
 * ⚑ THE LOAD-BEARING CASES:
 *   - the gates while the forum is OFF: nobody may post, only the Site Administrator may read, and
 *     nobody (Site Administrator included) reads participation (§16.5, 3a gate table);
 *   - the title/body validators accepting an EMPTY value on update — redaction (3b) depends on it —
 *     while still refusing it on create;
 *   - the immutability guard treating `"007"` and `"7"` as different titles.
 *
 * Wire and database behaviour: `tests/int/discussions.int.spec.ts`, `tests/http/discussions.http.spec.ts`.
 */
import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  createdText,
  forumPosting,
  forumReading,
  ownParticipation,
  refLabelFor,
  requireJoinedAtSeq,
  requireSubmissionKey,
} from '../../src/lib/discussions.js'
import { rejectContentEdits } from '../../src/hooks/discussions.js'
import type { User } from '../../src/payload-types.js'

const teacher = { id: 7, roles: [] } as unknown as User
const siteAdmin = { id: 1, roles: ['siteAdmin'] } as unknown as User

/** A request whose settings read says the forum is `on`. */
const reqFor = (user: User | null, on: boolean) =>
  ({
    user,
    context: {},
    payload: {
      findGlobal: async () => ({ features: { forumEnabled: on, publicLibraryLive: false } }),
      logger: { error: () => {} },
    },
  }) as unknown as PayloadRequest

const access = (fn: unknown, req: PayloadRequest) =>
  (fn as (a: { req: PayloadRequest }) => unknown)({ req })

describe('gates (3a table)', () => {
  it('posting: signed in and forum on — nobody while off, not even the Site Administrator', async () => {
    expect(await access(forumPosting, reqFor(teacher, true))).toBe(true)
    expect(await access(forumPosting, reqFor(teacher, false))).toBe(false)
    expect(await access(forumPosting, reqFor(siteAdmin, false))).toBe(false)
    expect(await access(forumPosting, reqFor(null, true))).toBe(false)
  })

  it('reading: anyone signed in while on; only the Site Administrator while off', async () => {
    expect(await access(forumReading, reqFor(teacher, true))).toBe(true)
    expect(await access(forumReading, reqFor(teacher, false))).toBe(false)
    expect(await access(forumReading, reqFor(siteAdmin, false))).toBe(true)
    expect(await access(forumReading, reqFor(null, true))).toBe(false)
  })

  it('participation: own rows while on; nobody while off, Site Administrator included', async () => {
    expect(await access(ownParticipation, reqFor(teacher, true))).toEqual({
      user: { equals: teacher.id },
    })
    expect(await access(ownParticipation, reqFor(teacher, false))).toBe(false)
    expect(await access(ownParticipation, reqFor(siteAdmin, false))).toBe(false)
    expect(await access(ownParticipation, reqFor(null, true))).toBe(false)
  })
})

describe('client inputs', () => {
  it('submissionKey: 16–64 characters of [A-Za-z0-9-], else 400', () => {
    const key = crypto.randomUUID()
    expect(requireSubmissionKey(key)).toBe(key)
    for (const bad of [undefined, null, '', 'short', 'x'.repeat(65), 'has space in it!!', 42]) {
      expect(() => requireSubmissionKey(bad), String(bad)).toThrow(/submissionKey/)
    }
  })

  it('joinedAtSeq: a whole number of at least 0, else 400', () => {
    expect(requireJoinedAtSeq(0)).toBe(0)
    expect(requireJoinedAtSeq(12)).toBe(12)
    for (const bad of [undefined, null, -1, 1.5, '3', Number.NaN, Infinity]) {
      expect(() => requireJoinedAtSeq(bad), String(bad)).toThrow(/joinedAtSeq/)
    }
  })

  it('title/body: required at create, empty allowed on update (redaction), capped always', () => {
    const validate = createdText('A title', 10) as (
      v: unknown,
      o: { operation?: string },
    ) => unknown
    expect(validate('', { operation: 'create' })).toBe('A title is required.')
    expect(validate('   ', { operation: 'create' })).toBe('A title is required.')
    expect(validate('Fractions', { operation: 'create' })).toBe(true)
    expect(validate('', { operation: 'update' })).toBe(true)
    expect(validate('x'.repeat(11), { operation: 'update' })).toMatch(/at most 10/)
  })
})

describe('refLabelFor', () => {
  it('is "<lesson name> · v<semver>"', () => {
    expect(
      refLabelFor({
        meta: { substrand_name: 'Equivalent Fractions' } as never,
        title: 'MATHEMATICS GRADE 7: EQUIVALENT FRACTIONS',
        semver: '1.2.0',
      }),
    ).toBe('Equivalent Fractions · v1.2.0')
  })
})

describe('rejectContentEdits', () => {
  const guard = rejectContentEdits({
    scalar: ['title', 'body', 'seq'],
    relationships: ['author'],
  }) as (a: {
    data: Record<string, unknown>
    operation: string
    originalDoc: Record<string, unknown>
  }) => unknown
  const original = { title: '007', body: '12', seq: 3, author: 5, lastSeq: 2 }

  it('allows system fields, unchanged content, and the same reference in another shape', () => {
    for (const data of [
      { title: '007', author: { id: 5 }, lastSeq: 3 },
      { author: '5' },
      { seq: 3, body: '12' },
    ]) {
      expect(
        guard({ data, operation: 'update', originalDoc: original }),
        JSON.stringify(data),
      ).toBe(data)
    }
  })

  it('refuses changed text — including "007" → "7" — and any object in a text field', () => {
    for (const data of [
      { title: '7' },
      { title: 'Other' },
      { body: { id: 12 } },
      { body: 12 },
      { title: { unexpected: 'changed' } },
      { seq: '3' },
    ]) {
      expect(
        () => guard({ data, operation: 'update', originalDoc: original }),
        JSON.stringify(data),
      ).toThrow(/cannot be edited/)
    }
  })

  it('refuses a changed reference, and a value that is not a reference at all', () => {
    for (const data of [
      { author: 6 },
      { author: null },
      { author: { unexpected: 'x' } },
      { author: 'abc' },
    ]) {
      expect(
        () => guard({ data, operation: 'update', originalDoc: original }),
        JSON.stringify(data),
      ).toThrow(/cannot be edited/)
    }
    // A non-reference is refused even where the stored value is null.
    expect(() =>
      guard({
        data: { author: { unexpected: 'x' } },
        operation: 'update',
        originalDoc: { author: null },
      }),
    ).toThrow(/cannot be edited/)
  })

  it('does not apply on create', () => {
    const data = { title: 'Anything' }
    expect(guard({ data, operation: 'create', originalDoc: {} })).toBe(data)
  })
})
