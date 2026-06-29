/**
 * Unit coverage for `isSemverConflict` — the predicate that decides whether `save-as-new` should retry.
 * Two concurrent saves on one plan can both compute the same next patch; the loser hits the unique
 * `(lessonPlan, semver)` index. We must recognise THAT specific conflict (and ONLY that) so the retry
 * loop kicks in for the race but every other failure — including unrelated uniqueness violations —
 * surfaces immediately rather than being masked by retries. Pure: no DB, no Payload boot.
 */
import { describe, it, expect } from 'vitest'

import { isSemverConflict } from '../../src/lib/semver.js'

describe('isSemverConflict', () => {
  it('matches by the constraint name on the error', () => {
    expect(isSemverConflict({ constraint: 'lessonPlan_semver_idx', message: 'whatever' })).toBe(true)
  })

  it('matches by the constraint name on a wrapped cause (drizzle wraps the pg error)', () => {
    expect(
      isSemverConflict({ message: 'insert failed', cause: { constraint: 'lessonPlan_semver_idx' } }),
    ).toBe(true)
  })

  it('matches by the index name in the message (constraint field absent)', () => {
    expect(
      isSemverConflict(new Error('duplicate key value violates unique constraint "lessonPlan_semver_idx"')),
    ).toBe(true)
  })

  it('matches the index name in a wrapped cause message', () => {
    expect(
      isSemverConflict({ message: 'insert failed', cause: { message: 'violates "lessonPlan_semver_idx"' } }),
    ).toBe(true)
  })

  it('does NOT retry a DIFFERENT uniqueness violation — it must surface as a bug', () => {
    // Same SQLSTATE, different constraint: a real integrity bug, not the semver race.
    expect(
      isSemverConflict({
        code: '23505',
        constraint: 'users_email_unique',
        message: 'duplicate key value violates unique constraint "users_email_unique"',
      }),
    ).toBe(false)
    // Generic duplicate-key text with no index name → not ours.
    expect(isSemverConflict(new Error('duplicate key value violates unique constraint'))).toBe(false)
  })

  it('does NOT match unrelated errors (so they still surface, not retried)', () => {
    expect(isSemverConflict(new Error('stale version — reload before saving'))).toBe(false)
    expect(isSemverConflict({ code: '23503', message: 'foreign_key_violation' })).toBe(false)
    expect(isSemverConflict(null)).toBe(false)
    expect(isSemverConflict(undefined)).toBe(false)
    expect(isSemverConflict('boom')).toBe(false)
  })
})
