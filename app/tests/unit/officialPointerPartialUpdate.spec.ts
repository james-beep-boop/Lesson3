/**
 * `validateOfficialVersionPointer` — that its checks survive a PARTIAL update.
 *
 * ⚑ THE HOLE THIS PINS. The hook used to open with `if (!data?.officialVersion) return data`, which
 * reads as "no pointer in play, nothing to check". But a Payload update carries only the SUBMITTED
 * fields, so a PATCH containing just `subjectGrade` has no `officialVersion` in `data` — and returned
 * here untouched. The plan moved to a different subject-grade while its Official version still
 * belonged to the old one: exactly the state the last check in the function exists to prevent,
 * reachable by OMITTING a field rather than by setting one.
 *
 * It was inconsistent with its own neighbour, which is what makes it worth a test rather than just a
 * fix: the subject-grade comparison three statements below already wrote
 * `data.subjectGrade ?? originalDoc?.subjectGrade`, because it knew updates can be partial. The early
 * return did not. The lesson-plan repair form is a live sender of exactly this shape.
 *
 * ⚑ The old early return was ALSO doing type narrowing — removing it surfaced an unguarded
 * `data.subjectGrade`. A guard that silently doubles as a type assertion is part of how this hid.
 *
 * DB-free: only `payload.findByID` is stubbed, so the hook's own control flow is what runs.
 */
import { describe, expect, it, vi } from 'vitest'

import { validateOfficialVersionPointer } from '@/hooks/lessonPlan'

/**
 * The user-facing sentence, not `Error.message`. Payload's `ValidationError` puts the message in
 * `data.errors[]` and leaves `.message` as an untranslated i18n key
 * (`error:followingFieldsInvalid…`), so asserting on `.message` would pass for ANY validation
 * failure — including a different one than the case intends.
 */
const rejectionMessage = async (call: () => Promise<unknown>): Promise<string> => {
  try {
    await call()
    return '(did not reject)'
  } catch (e) {
    const nested = (e as { data?: { errors?: { message?: string }[] } }).data?.errors
    return nested?.[0]?.message ?? (e as Error).message
  }
}

/** The stored Official version the plan points at, as the hook reads it back. */
const officialVersion = { id: 900, lessonPlan: 1, subjectGrade: 5 }

const run = (args: {
  data: Record<string, unknown>
  originalDoc?: Record<string, unknown>
  operation?: 'create' | 'update'
}) => {
  const findByID = vi.fn().mockResolvedValue(officialVersion)
  const req = {
    user: { id: 7 },
    t: ((k: string) => k) as unknown,
    payload: { findByID },
  } as never
  return {
    findByID,
    call: () =>
      (
        validateOfficialVersionPointer as unknown as (a: {
          data: unknown
          operation: string
          originalDoc: unknown
          req: unknown
        }) => Promise<unknown>
      )({
        data: args.data,
        operation: args.operation ?? 'update',
        originalDoc: args.originalDoc ?? { id: 1, subjectGrade: 5, officialVersion: 900 },
        req,
      }),
  }
}

describe('a partial update cannot slip past the subject-grade invariant', () => {
  it('REJECTS moving the plan to another subject-grade when only subjectGrade is submitted', async () => {
    // The exact shape the repair form can send: no `officialVersion` key at all.
    const { call } = run({ data: { subjectGrade: 6 } })
    expect(await rejectionMessage(call)).toMatch(/must match this lesson plan subject-grade/i)
  })

  it('still checks ownership on a partial update', async () => {
    // Same omission, but the stored Official version belongs to a different plan.
    const findByID = vi.fn().mockResolvedValue({ id: 900, lessonPlan: 42, subjectGrade: 5 })
    const req = { user: { id: 7 }, t: (k: string) => k, payload: { findByID } } as never
    const call = () =>
      (
        validateOfficialVersionPointer as unknown as (a: {
          data: unknown
          operation: string
          originalDoc: unknown
          req: unknown
        }) => Promise<unknown>
      )({
        data: { subjectGrade: 5 },
        operation: 'update',
        originalDoc: { id: 1, subjectGrade: 5, officialVersion: 900 },
        req,
      })
    expect(await rejectionMessage(call)).toMatch(/must belong to this lesson plan/i)
  })

  it('reads the STORED pointer when the request does not mention one', async () => {
    // Proof the fallback is what makes the checks reachable: the hook looked the version up at all.
    const { findByID, call } = run({ data: { subjectGrade: 5 } })
    await call()
    expect(findByID).toHaveBeenCalledOnce()
  })

  it('allows a same-subject-grade partial update', async () => {
    const { call } = run({ data: { subjectGrade: 5 } })
    await expect(call()).resolves.toEqual({ subjectGrade: 5 })
  })

  it('does nothing when the plan has no Official version yet', async () => {
    // The legitimate early return: a freshly ingested plan before its pointer is set. No lookup.
    const { findByID, call } = run({
      data: { subjectGrade: 6 },
      originalDoc: { id: 1, subjectGrade: 5 },
    })
    await expect(call()).resolves.toEqual({ subjectGrade: 6 })
    expect(findByID).not.toHaveBeenCalled()
  })

  it('still rejects an explicit pointer that mismatches, as it always did', async () => {
    const { call } = run({ data: { officialVersion: 900, subjectGrade: 6 } })
    expect(await rejectionMessage(call)).toMatch(/must match this lesson plan subject-grade/i)
  })
})
