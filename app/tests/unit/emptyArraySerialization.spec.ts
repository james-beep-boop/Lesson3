/**
 * The editing-access structural guard against a submitted array field that is NOT an array.
 *
 * Why one can arrive at all — Payload posts an empty array field as the number `0` — is documented on
 * `submittedRows` in src/hooks/fieldSplit.ts, which is also where the accept/reject rule lives.
 *
 * This suite pins BOTH halves, because fixing only the crash would be easy to get dangerously wrong.
 * The guard is a security control (teachers with editing access may not change structure), so:
 *   - `0` must be accepted, or nobody with editing access can save a bundle with an empty optional array (the 500);
 *   - every OTHER non-array must be REJECTED, not read as "no rows" — otherwise junk passes silently
 *     whenever the stored field happens to be empty, and a future client-side serialization change
 *     hides instead of failing loudly.
 * The wire-level proof of the happy path lives in tests/http/endpoints.http.spec.ts.
 */
import { describe, it, expect } from 'vitest'
import { Forbidden } from 'payload'

import { applyEditorFieldSplit } from '../../src/hooks/fieldSplit'
import { VERSION_EDITOR_KEYS } from '../../src/hooks/bundleVersion'

const SG_ID = 7
const editor = { id: 11, assignments: [{ subjectGrade: SG_ID, role: 'editor' }] } as never

type SplitOutput = Record<string, unknown> & {
  lessons: Array<{ framework: unknown; overview?: unknown }>
  finalExplanation: { sections: unknown; rubric: unknown; instructions?: unknown }
  summaryTable: { lessons: unknown }
}

/** Stored doc whose optional arrays are EMPTY — what the seeded/minimal bundle actually looks like. */
const originalEmpty = () => ({
  subjectGrade: SG_ID,
  // The lesson row (with its nested framework) exercises the per-lesson branch of the guard.
  lessons: [{ id: 'L1', overview: 'stored overview', framework: [{ id: 'F1' }] }],
  finalExplanation: { instructions: 'stored instructions', sections: [], rubric: [] },
  summaryTable: { lessons: [] },
})

/** …and one whose arrays are POPULATED, to prove the guard still bites. */
const originalPopulated = () => ({
  subjectGrade: SG_ID,
  finalExplanation: { sections: [{ id: 'S1' }, { id: 'S2' }], rubric: [{ id: 'R1' }] },
  summaryTable: { lessons: [{ id: 'T1' }] },
})

const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown>) =>
  applyEditorFieldSplit({
    data,
    originalDoc,
    operation: 'update',
    req: { user: editor } as never,
    editorTopLevelKeys: VERSION_EDITOR_KEYS,
  }) as unknown as SplitOutput

/** The exact shape the editor's Save posts for a bundle whose optional arrays are all empty. */
const zeroContainers = () => ({
  subjectGrade: SG_ID,
  lessons: [{ id: 'L1', overview: 'edited overview', framework: [{ id: 'F1' }] }],
  finalExplanation: { instructions: 'edited instructions', sections: 0, rubric: 0 },
  summaryTable: { lessons: 0 },
})

describe('submitted array field that is not an array', () => {
  it('accepts 0 for arrays stored empty, keeps them arrays, and lands the prose edit', () => {
    // The reported 500 was `(rows ?? []).map is not a function`; an unguarded call here fails the
    // test if it ever returns.
    const out = run(zeroContainers(), originalEmpty())
    expect(out.finalExplanation.sections, 'must stay an array, not the posted number').toEqual([])
    expect(out.finalExplanation.rubric).toEqual([])
    expect(out.summaryTable.lessons).toEqual([])
    expect(out.lessons[0].overview).toBe('edited overview')
    expect(out.finalExplanation.instructions).toBe('edited instructions')
  })

  it('survives an empty STORED lessons list (the `for…of 0` trap)', () => {
    // `data.lessons ?? []` does not catch 0 — it is not nullish — so iteration threw "0 is not
    // iterable" once the sequence check passed, which it does when both sides are empty.
    expect(() =>
      run({ subjectGrade: SG_ID, lessons: 0, finalExplanation: { sections: 0 } }, {
        ...originalEmpty(),
        lessons: [],
      }),
    ).not.toThrow()
  })

  // ---- the half that must NOT regress into a bypass ----
  //
  // These assert `Forbidden` SPECIFICALLY, not merely "throws". The pre-fix code threw a TypeError on
  // exactly these inputs, so a bare `.toThrow()` passed against the bug and proved nothing — it could
  // not tell "properly rejected" from "crashed on the way to deciding".

  it('rejects a malformed container even when the stored field is EMPTY', () => {
    // The narrow rule earning its keep: with a blanket "non-array means no rows" coercion, every one
    // of these compared equal to the stored [] and sailed through. `0` is the only legal sentinel.
    for (const malformed of [2, -1, 1.5, 'bad', {}, true, [1, 2].length + 1]) {
      expect(() =>
        run({ subjectGrade: SG_ID, finalExplanation: { sections: malformed } }, originalEmpty()),
        `sections: ${JSON.stringify(malformed)} must be rejected, not read as []`,
      ).toThrow(Forbidden)
    }
    expect(() =>
      run({ subjectGrade: SG_ID, summaryTable: { lessons: 'bad' } }, originalEmpty()),
    ).toThrow(Forbidden)
    expect(() => run({ subjectGrade: SG_ID, lessons: {} }, originalEmpty())).toThrow(Forbidden)
  })

  it('rejects a non-array when rows ARE stored (fail-closed on every container)', () => {
    // Clearing rows is a structural change; a count is still not a sequence of ids.
    for (const data of [
      { subjectGrade: SG_ID, finalExplanation: { sections: 0 } },
      { subjectGrade: SG_ID, finalExplanation: { rubric: 0 } },
      { subjectGrade: SG_ID, summaryTable: { lessons: 0 } },
      { subjectGrade: SG_ID, finalExplanation: { sections: 2 } },
      { subjectGrade: SG_ID, finalExplanation: { sections: 'bad' } },
    ]) {
      expect(() => run(data, originalPopulated()), JSON.stringify(data)).toThrow(Forbidden)
    }
  })

  it('still rejects genuine cardinality and order changes', () => {
    // Regression fence around the pre-existing guard: the fix must not have relaxed it.
    const added = {
      subjectGrade: SG_ID,
      finalExplanation: { sections: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }] },
    }
    expect(() => run(added, originalPopulated())).toThrow(Forbidden)
    const reordered = {
      subjectGrade: SG_ID,
      finalExplanation: { sections: [{ id: 'S2' }, { id: 'S1' }] },
    }
    expect(() => run(reordered, originalPopulated())).toThrow(Forbidden)
  })

  it('normalizes the sentinel for ADMINS too, so the no-op guard still works', () => {
    // Admins return before the teacher with editing access guard, so nothing down there can help them. Left as `0`, the
    // merged doc differs from the source under `comparableContent` (canonicalJson: `0` is never
    // `[]`), and endpoints/versionEdit.ts mints a byte-identical duplicate version instead of
    // returning 400 for a save that changed nothing. Both admin roles, since they fork separately.
    for (const admin of [
      { id: 2, roles: ['siteAdmin'] },
      { id: 3, assignments: [{ subjectGrade: SG_ID, role: 'subjectAdmin' }] },
    ]) {
      const out = applyEditorFieldSplit({
        data: zeroContainers(),
        originalDoc: originalEmpty(),
        operation: 'update',
        req: { user: admin } as never,
        editorTopLevelKeys: VERSION_EDITOR_KEYS,
      }) as unknown as SplitOutput
      expect(out.finalExplanation.sections, JSON.stringify(admin)).toEqual([])
      expect(out.finalExplanation.rubric).toEqual([])
      expect(out.summaryTable.lessons).toEqual([])
    }
  })

  // ---- the NESTED container: lessons[].framework ----
  //
  // Both the normalizer and the guard walk into lesson rows, and a lesson with no phases is the same
  // empty-array shape one level down. Covered separately because nothing above reaches it:
  // `zeroContainers()` submits a populated `framework`, so the nested path was previously untested.

  /** Stored doc whose LESSON has no phases — the nested empty array. */
  const originalEmptyFramework = () => ({
    subjectGrade: SG_ID,
    lessons: [{ id: 'L1', overview: 'stored overview', framework: [] }],
    finalExplanation: { sections: [], rubric: [] },
    summaryTable: { lessons: [] },
  })
  const submittedFramework = (framework: unknown) => ({
    subjectGrade: SG_ID,
    lessons: [{ id: 'L1', overview: 'edited overview', framework }],
  })

  it('accepts and normalizes a nested framework sentinel', () => {
    const out = run(submittedFramework(0), originalEmptyFramework())
    expect(out.lessons[0].framework, 'must be an array, not the posted number').toEqual([])
    expect(out.lessons[0].overview).toBe('edited overview')
  })

  it('normalizes the nested sentinel for admins too', () => {
    const out = applyEditorFieldSplit({
      data: submittedFramework(0),
      originalDoc: originalEmptyFramework(),
      operation: 'update',
      req: { user: { id: 2, roles: ['siteAdmin'] } } as never,
      editorTopLevelKeys: VERSION_EDITOR_KEYS,
    }) as unknown as SplitOutput
    expect(out.lessons[0].framework).toEqual([])
  })

  it('rejects a malformed nested framework, and a sentinel against stored phases', () => {
    // Malformed, stored empty → must not be read as "no phases".
    for (const bad of ['bad', 2, {}]) {
      expect(() => run(submittedFramework(bad), originalEmptyFramework()), String(bad)).toThrow(
        Forbidden,
      )
    }
    // `0` against a lesson that HAS phases is a structural change — fail-closed.
    expect(() => run(submittedFramework(0), originalEmpty())).toThrow(Forbidden)
  })

  it('keeps nullish reading as no rows (the pre-existing `?? []` contract)', () => {
    // Deliberately NOT narrowed with the rest: `null` was accepted before this fix, and tightening it
    // is a separate behavioural change. Pinned so the choice is visible and easy to flip.
    expect(() =>
      run({ subjectGrade: SG_ID, finalExplanation: { sections: null } }, originalEmpty()),
    ).not.toThrow()
  })
})
