/**
 * The Combine versions engine (SPEC §6, phase 2) — `merge3` and `planCombine`, DB-free.
 *
 * ⚑ EVERY TEST VERSION HAS ITS OWN ROW IDS, as real saves do (`save-as-new` strips and regenerates
 * them). A test that reused ids across versions would let id-based pairing pass by accident, which is
 * the exact design error this engine exists to avoid — so `version()` mints fresh ids per call.
 *
 *   D   merge3: disjoint paragraphs combine; the same paragraph conflicts; identical edits apply
 *       once; adjacent paragraphs combine; insertions at one point conflict
 *   P1  one side changed a field → that side; both the same → no change; neither → nothing
 *   P2  both changed one field: different paragraphs merge, the same paragraph conflicts, emptied
 *       conflicts
 *   P3  the overlay is keyed by the STARTING version's rows and holds only what differs from it
 *   P4  non-prose content: one side changed it → start there; both → refused; no ancestor → refused
 *   P5  structure or system data differs → refused; an ancestor of another shape → two-way
 *   P6  combining a version with its own ancestor yields the descendant
 *   W   `withoutProse` removes exactly what `projectCapture` calls prose
 */
import { describe, expect, it } from 'vitest'

import { createMergeBudget, merge3 } from '../../src/lib/combine/diff3.js'
import { planCombine, withoutProse } from '../../src/lib/combine/engine.js'
import { projectCapture } from '../../src/lib/editRecovery/projection.js'

type Doc = Record<string, unknown>

let seq = 0
const id = () => `row-${++seq}`

/** A version with fresh row ids. `edit` mutates the plain content before ids are attached. */
function version(edit: (c: ReturnType<typeof content>) => void = () => {}): Doc {
  const c = content()
  edit(c)
  return {
    id: ++seq,
    semver: '1.0.x',
    lessonPlan: 7,
    subjectGrade: 5,
    meta: c.meta,
    lessons: c.lessons.map((l, i) => ({
      ...l,
      id: id(),
      number: i + 1,
      framework: l.framework.map((f) => ({ ...f, id: id() })),
    })),
    finalExplanation: {
      ...c.finalExplanation,
      sections: c.finalExplanation.sections.map((s) => ({ ...s, id: id() })),
      rubric: c.finalExplanation.rubric.map((r) => ({ ...r, id: id() })),
    },
    summaryTable: {
      ...c.summaryTable,
      lessons: c.summaryTable.lessons.map((l) => ({ ...l, id: id() })),
    },
  }
}

function content() {
  return {
    meta: { subject: 'Biology', grade: 10, substrand_name: 'Cells' },
    lessons: [0, 1].map((n) => ({
      title: `Lesson ${n + 1}`,
      aresKeywords: `lesson ${n + 1} resources`,
      duration: '40 min',
      overview: `Overview ${n + 1}, first paragraph.\nOverview ${n + 1}, second paragraph.\nOverview ${n + 1}, third paragraph.`,
      teacherReflection: `Reflect ${n + 1}.`,
      slo: { purpose: `Purpose ${n + 1}.`, knowledge: 'K.', skills: 'S.', attitudes: 'A.' },
      summaryTablePrompt: { observed: 'O.', learned: 'L.', explained: 'E.' },
      resourceLinks: {
        predict: { video: null, reading: null, fallback_search_url: 'https://x/p' },
      },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'Predict.',
          teacherMoves: 'Elicit.',
          sensemakingStrategy: 'Discuss.',
          formativeAssessment: 'Observe.',
        },
      ],
    })),
    finalExplanation: {
      instructions: 'Answer every section.',
      sections: [{ title: 'Section A', prompt: 'Explain.', exemplar: 'An exemplar answer.' }],
      rubric: [{ criterion: 'Clarity', points: 4 }],
    },
    summaryTable: {
      subStrand: 'Cells',
      drivingQuestion: 'Why?',
      lessons: [{ number: 1, title: 'Lesson 1', observed: 'o', learned: 'l', explained: 'e' }],
    },
  }
}

type Ok = Extract<ReturnType<typeof planCombine>, { ok: true }>
const ok = (p: ReturnType<typeof planCombine>): Ok => {
  if (!p.ok) throw new Error(`expected a plan, got refusal: ${p.refusal}`)
  return p
}

/** The capture key of lesson `i` in `doc` (scope `lesson`). */
const lessonKey = (doc: Doc, i: number) => `lesson:${(doc.lessons as Doc[])[i].id}`
const frameworkKey = (doc: Doc, i: number) =>
  `framework:${((doc.lessons as Doc[])[i].framework as Doc[])[0].id}`

describe('D — merge3, one line per paragraph', () => {
  it('appends 150,000 inserted paragraphs without overflowing the argument stack', () => {
    const added = Array.from({ length: 150_000 }, () => 'x').join('\n')
    expect(merge3('one\ntwo\nthree', `one\ntwo\nthree\n${added}`, 'ONE\ntwo\nthree')).toEqual({
      ok: true,
      text: `ONE\ntwo\nthree\n${added}`,
    })
  })

  it('refuses a combined output exceeding the text bound even if each input fits', () => {
    const text = 'x'.repeat(550_000)
    expect(merge3('one\ntwo\nthree', `${text}\ntwo\nthree`, `one\ntwo\n${text}`)).toEqual({
      ok: false,
    })
  })

  it('shares a finite work allowance across fields', () => {
    const budget = createMergeBudget()
    budget.remaining = 31 // two 4-by-4 tables need 32 cells
    expect(merge3('one\ntwo\nthree', 'ONE\ntwo\nthree', 'one\ntwo\nTHREE', budget)).toEqual({
      ok: false,
    })
  })

  const base = 'one\ntwo\nthree'

  it('edits to different paragraphs combine', () => {
    expect(merge3(base, 'ONE\ntwo\nthree', 'one\ntwo\nTHREE')).toEqual({
      ok: true,
      text: 'ONE\ntwo\nTHREE',
    })
  })

  it('edits to adjacent paragraphs combine', () => {
    expect(merge3(base, 'ONE\ntwo\nthree', 'one\nTWO\nthree')).toEqual({
      ok: true,
      text: 'ONE\nTWO\nthree',
    })
  })

  it('different edits to the same paragraph conflict', () => {
    expect(merge3(base, 'one\nTWO\nthree', 'one\nDeux\nthree')).toEqual({ ok: false })
  })

  it('the same edit on both sides applies once', () => {
    expect(merge3(base, 'one\nTWO\nthree', 'one\nTWO\nthree')).toEqual({
      ok: true,
      text: 'one\nTWO\nthree',
    })
  })

  it('an added paragraph and an edit elsewhere combine', () => {
    expect(merge3(base, 'one\ntwo\nthree\nfour', 'ONE\ntwo\nthree')).toEqual({
      ok: true,
      text: 'ONE\ntwo\nthree\nfour',
    })
  })

  it('two different paragraphs added at the same point conflict — which comes first is a choice', () => {
    expect(merge3(base, 'one\ntwo\nthree\nfour', 'one\ntwo\nthree\nvier')).toEqual({ ok: false })
  })

  it('a deletion and an edit of the same paragraph conflict', () => {
    expect(merge3(base, 'one\nthree', 'one\nTWO\nthree')).toEqual({ ok: false })
  })
})

describe('P1 — one side changed a field', () => {
  it('takes the changed side, and lists the change', () => {
    const base = version()
    const a = version()
    const b = version((c) => (c.lessons[0].teacherReflection = 'A new reflection.'))
    const plan = ok(planCombine({ base, a, b }))

    expect(plan.start).toBe('a')
    expect(plan.ancestry).toBe('three-way')
    expect(plan.conflicts).toEqual([])
    expect(plan.overlay).toEqual({ [lessonKey(a, 0)]: { teacherReflection: 'A new reflection.' } })
    expect(plan.changes).toEqual([
      {
        key: lessonKey(a, 0),
        field: 'teacherReflection',
        heading: 'Lesson 1',
        label: 'Teacher reflection',
        from: 'b',
      },
    ])
  })

  it("a's own change needs no overlay — the editor already opens a", () => {
    const base = version()
    const a = version((c) => (c.lessons[1].slo.purpose = 'Sharper purpose.'))
    const b = version()
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.overlay).toEqual({})
    expect(plan.conflicts).toEqual([])
  })

  it('identical changes on both sides are not a conflict', () => {
    const base = version()
    const same = (c: ReturnType<typeof content>) =>
      (c.finalExplanation.instructions = 'Answer all.')
    const plan = ok(planCombine({ base, a: version(same), b: version(same) }))
    expect(plan.conflicts).toEqual([])
    expect(plan.overlay).toEqual({})
  })

  it('null and an empty string are the same text', () => {
    const base = version()
    const a = version((c) => ((c.lessons[0] as Doc).teacherReflection = null))
    const b = version((c) => (c.lessons[0].teacherReflection = ''))
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.conflicts).toEqual([])
  })
})

describe('P2 — both sides changed one field', () => {
  it('different paragraphs merge', () => {
    const base = version()
    const a = version((c) => {
      c.lessons[0].overview = c.lessons[0].overview.replace('first paragraph', 'FIRST paragraph')
    })
    const b = version((c) => {
      c.lessons[0].overview = c.lessons[0].overview.replace('third paragraph', 'THIRD paragraph')
    })
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.conflicts).toEqual([])
    expect(plan.overlay[lessonKey(a, 0)].overview).toBe(
      'Overview 1, FIRST paragraph.\nOverview 1, second paragraph.\nOverview 1, THIRD paragraph.',
    )
    expect(plan.changes[0].from).toBe('both')
  })

  it('the same paragraph conflicts, carrying all three texts', () => {
    const base = version()
    const a = version((c) => (c.lessons[0].framework[0].teacherMoves = 'Ask, then wait.'))
    const b = version((c) => (c.lessons[0].framework[0].teacherMoves = 'Model first.'))
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.overlay).toEqual({})
    expect(plan.conflicts).toEqual([
      {
        key: frameworkKey(a, 0),
        field: 'teacherMoves',
        heading: 'Lesson 1 — phase 1',
        label: 'Teacher moves',
        base: 'Elicit.',
        a: 'Ask, then wait.',
        b: 'Model first.',
        reason: 'both-edited',
      },
    ])
  })

  it('emptied on one side and edited on the other is never resolved silently', () => {
    const base = version()
    const a = version((c) => (c.lessons[1].teacherReflection = ''))
    const b = version((c) => (c.lessons[1].teacherReflection = 'Reflect 2, extended.'))
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.conflicts.map((c) => c.reason)).toEqual(['emptied'])
  })
})

describe('P3 — keyed by the starting version', () => {
  it('when the combine starts from b, keys are b’s rows and b’s own prose is not repeated', () => {
    const base = version()
    // a: a prose edit. b: an ADMIN edit (duration), so the combine must start from b.
    const a = version((c) => (c.lessons[0].teacherReflection = 'From a.'))
    const b = version((c) => {
      c.lessons[0].duration = '80 min'
      c.lessons[1].teacherReflection = 'From b.'
    })
    const plan = ok(planCombine({ base, a, b }))
    expect(plan.start).toBe('b')
    expect(plan.overlay).toEqual({ [lessonKey(b, 0)]: { teacherReflection: 'From a.' } })
  })
})

describe('P4 — content only an administrator can edit', () => {
  it('both sides changed it differently → refused, with a message a teacher can act on', () => {
    const base = version()
    const a = version((c) => (c.lessons[0].duration = '60 min'))
    const b = version((c) => (c.finalExplanation.sections[0].exemplar = 'A better exemplar.'))
    const plan = planCombine({ base, a, b })
    expect(plan).toMatchObject({ ok: false, refusal: 'admin-both' })
    expect(plan.ok === false && plan.message).toContain('subject administrator')
  })

  it('the version title counts as administrator content (save-as-new copies it, so siblings share it)', () => {
    const base = version()
    const a = { ...version(), title: 'Renamed by A' }
    const b = { ...version(), title: 'Renamed by B' }
    expect(planCombine({ base, a, b })).toMatchObject({ ok: false, refusal: 'admin-both' })
  })

  it('both sides made the SAME admin change → fine', () => {
    const base = version()
    const same = (c: ReturnType<typeof content>) => (c.lessons[0].duration = '60 min')
    expect(planCombine({ base, a: version(same), b: version(same) }).ok).toBe(true)
  })

  it('no ancestor and admin content differs → refused: nobody can say who changed it', () => {
    const a = version((c) => (c.lessons[0].duration = '60 min'))
    const b = version()
    expect(planCombine({ base: null, a, b })).toMatchObject({ ok: false, refusal: 'admin-both' })
  })
})

describe('P5 — structure, system data, and an unusable ancestor', () => {
  it('refuses indistinguishable lessons rather than putting reordered prose in another lesson', () => {
    const ambiguous = (c: ReturnType<typeof content>) => {
      c.lessons.forEach((l) => {
        l.aresKeywords = 'shared resources'
      })
    }
    const base = version(ambiguous)
    const a = version((c) => {
      ambiguous(c)
      c.lessons.reverse()
    })
    const b = version((c) => {
      ambiguous(c)
      c.lessons[0].teacherReflection = 'Lesson 1 edits.'
    })
    expect(planCombine({ base, a, b })).toMatchObject({ ok: false, refusal: 'structure' })
  })

  it('refuses lessons with distinct system identities reordered on one side', () => {
    expect(
      planCombine({ base: version(), a: version((c) => c.lessons.reverse()), b: version() }),
    ).toMatchObject({ ok: false, refusal: 'structure' })
  })

  it('does not use an ancestor whose row correspondence is ambiguous', () => {
    const base = version((c) => c.lessons.reverse())
    const plan = ok(
      planCombine({
        base,
        a: version(),
        b: version((c) => {
          c.lessons[0].overview = 'Edit.'
        }),
      }),
    )
    expect(plan.ancestry).toBe('two-way')
    expect(plan.conflicts).toHaveLength(1)
  })

  it('refuses repeated teaching phases whose row correspondence is ambiguous', () => {
    const repeated = (c: ReturnType<typeof content>) => {
      c.lessons[0].framework.push({ ...c.lessons[0].framework[0] })
    }
    expect(
      planCombine({ base: version(repeated), a: version(repeated), b: version(repeated) }),
    ).toMatchObject({ ok: false, refusal: 'structure' })
  })

  it('a different number of lessons → refused', () => {
    const a = version()
    const b = version((c) => c.lessons.push({ ...c.lessons[0], title: 'Lesson 3' }))
    expect(planCombine({ base: version(), a, b })).toMatchObject({ refusal: 'structure' })
  })

  const links = (name: string) => ({
    predict: { video: null, reading: null, fallback_search_url: `https://resources.test/${name}` },
  })

  it.each(['a', 'b'] as const)(
    'takes one-sided resource updates from %s and keeps the teacher prose',
    (changed) => {
      const a = version((c) => {
        c.lessons[0].teacherReflection = 'Teacher reflection.'
      })
      const b = version()
      const updated = changed === 'a' ? a : b
      ;(updated.lessons as Doc[])[0].resourceLinks = links('new')
      const plan = ok(planCombine({ base: version(), a, b }))
      expect(plan.start).toBe(changed)
      expect(plan.ancestry).toBe('three-way')
      expect(plan.conflicts).toEqual([])
      if (changed === 'b')
        expect(plan.overlay[lessonKey(b, 0)]).toMatchObject({
          teacherReflection: 'Teacher reflection.',
        })
    },
  )

  it('refuses distinct resource updates on both sides', () => {
    const a = version((c) => {
      c.lessons[0].resourceLinks = links('a')
    })
    const b = version((c) => {
      c.lessons[0].resourceLinks = links('b')
    })
    expect(planCombine({ base: version(), a, b })).toMatchObject({ ok: false, refusal: 'system' })
  })

  it('accepts the same resource update on both sides', () => {
    const a = version((c) => {
      c.lessons[0].resourceLinks = links('same')
    })
    const b = version((c) => {
      c.lessons[0].resourceLinks = links('same')
    })
    expect(planCombine({ base: version(), a, b })).toMatchObject({
      ok: true,
      ancestry: 'three-way',
    })
  })

  it('keeps refusing different resource links without a common ancestor', () => {
    const a = version()
    const b = version((c) => {
      c.lessons[0].resourceLinks = links('new')
    })
    expect(planCombine({ base: null, a, b })).toMatchObject({ ok: false, refusal: 'system' })
  })

  it('an unaligned ancestor does not authorize differing resource links', () => {
    const base = version((c) => {
      c.lessons.pop()
    })
    const a = version()
    const b = version((c) => {
      c.lessons[0].resourceLinks = links('new')
    })
    expect(planCombine({ base, a, b })).toMatchObject({ ok: false, refusal: 'system' })
  })

  it('chooses the resource-updated side when administrator edits match on both sides', () => {
    const a = version((c) => {
      c.lessons[0].duration = '50 min'
    })
    const b = version((c) => {
      c.lessons[0].duration = '50 min'
      c.lessons[0].resourceLinks = links('new')
    })
    expect(planCombine({ base: version(), a, b })).toMatchObject({ ok: true, start: 'b' })
  })

  it('refuses when administrator and resource updates require different starting versions', () => {
    const a = version((c) => {
      c.lessons[0].duration = '50 min'
    })
    const b = version((c) => {
      c.lessons[0].resourceLinks = links('new')
    })
    expect(planCombine({ base: version(), a, b })).toMatchObject({
      ok: false,
      refusal: 'admin-both',
    })
  })

  it('resource updates still refuse ambiguous lesson keys while unchanged resource identities work', () => {
    const repeated = (c: ReturnType<typeof content>) => {
      for (const [i, lesson] of c.lessons.entries()) {
        lesson.aresKeywords = 'shared keywords'
        lesson.resourceLinks = links(`lesson-${i}`)
      }
    }
    const base = version(repeated)
    const a = version(repeated)
    const unchanged = version(repeated)
    expect(planCombine({ base, a, b: unchanged })).toMatchObject({ ok: true })
    const changed = version((c) => {
      repeated(c)
      c.lessons[0].resourceLinks = links('updated')
    })
    expect(planCombine({ base, a, b: changed })).toMatchObject({ ok: false, refusal: 'structure' })
  })

  it('resource updates never justify reordering lessons with distinct upload keys', () => {
    const a = version()
    const b = version((c) => {
      c.lessons.reverse()
      c.lessons[0].resourceLinks = links('updated')
    })
    expect(planCombine({ base: version(), a, b })).toMatchObject({
      ok: false,
      refusal: 'structure',
    })
  })

  it('no ancestor → every difference is a choice, and nothing is applied', () => {
    const a = version((c) => (c.lessons[0].teacherReflection = 'From a.'))
    const b = version((c) => (c.lessons[1].teacherReflection = 'From b.'))
    const plan = ok(planCombine({ base: null, a, b }))
    expect(plan.ancestry).toBe('two-way')
    expect(plan.overlay).toEqual({})
    expect(plan.conflicts.map((c) => c.reason)).toEqual(['no-ancestor', 'no-ancestor'])
  })

  it('an ancestor whose rows do not pair is not used — two-way, not a guess', () => {
    const olderShape = version((c) => c.lessons.pop())
    const a = version((c) => (c.lessons[0].teacherReflection = 'From a.'))
    const b = version()
    const plan = ok(planCombine({ base: olderShape, a, b }))
    expect(plan.ancestry).toBe('two-way')
    expect(plan.conflicts).toHaveLength(1)
  })
})

describe('P6 — combining a version with its own ancestor', () => {
  it('yields the descendant’s text', () => {
    const parent = version()
    const child = version((c) => (c.lessons[0].overview = 'Rewritten.'))
    const plan = ok(planCombine({ base: parent, a: parent, b: child }))
    expect(plan.conflicts).toEqual([])
    expect(plan.overlay).toEqual({ [lessonKey(parent, 0)]: { overview: 'Rewritten.' } })
  })
})

describe('Combine work bounds', () => {
  it('turns expensive later fields into controlled conflicts after the document budget is spent', () => {
    const prose = Array.from({ length: 700 }, (_, i) => `paragraph ${i}`).join('\n')
    const fill = (c: ReturnType<typeof content>, side: 'base' | 'a' | 'b') => {
      const text =
        side === 'a'
          ? prose.replace('paragraph 0', 'A')
          : side === 'b'
            ? prose.replace('paragraph 699', 'B')
            : prose
      c.lessons.forEach((l) => {
        l.overview = text
        l.teacherReflection = text
      })
    }
    const plan = ok(
      planCombine({
        base: version((c) => fill(c, 'base')),
        a: version((c) => fill(c, 'a')),
        b: version((c) => fill(c, 'b')),
      }),
    )
    expect(plan.changes).toHaveLength(2)
    expect(plan.conflicts).toHaveLength(2)
    expect(plan.conflicts.every((c) => c.reason === 'both-edited')).toBe(true)
  })

  it('refuses an oversized document before projection and merge work', () => {
    expect(
      planCombine({
        base: version(),
        a: version((c) => {
          c.lessons[0].overview = 'x'.repeat(6_000_001)
        }),
        b: version(),
      }),
    ).toMatchObject({ ok: false, refusal: 'size' })
  })
})

describe('W — withoutProse agrees with projectCapture about what prose is', () => {
  it('nothing projectCapture sees survives, and nothing else is removed', () => {
    const doc = version()
    expect(projectCapture(doc)).not.toEqual({})
    expect(projectCapture(withoutProse(doc))).toEqual({})

    const stripped = withoutProse(doc) as { lessons: Doc[]; finalExplanation: Doc }
    expect(stripped.lessons[0].duration).toBe('40 min')
    expect(stripped.lessons[0].resourceLinks).toEqual((doc.lessons as Doc[])[0].resourceLinks)
    expect((stripped.lessons[0].framework as Doc[])[0].phase).toBe('Predict Phase')
    expect((stripped.finalExplanation.sections as Doc[])[0].exemplar).toBe('An exemplar answer.')
    expect(stripped.finalExplanation.rubric).toEqual((doc.finalExplanation as Doc).rubric)
  })
})
