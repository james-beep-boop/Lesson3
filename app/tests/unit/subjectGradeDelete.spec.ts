import { describe, expect, it } from 'vitest'

import { deleteConsequences } from '../../src/lib/assignmentCounts'

/**
 * The delete confirmation's sentence, pinned where it is a pure function.
 *
 * ⚑ THIS EXISTS BECAUSE THE E2E TRIED TO DO IT AND SHOULD NOT HAVE. The first version asserted
 * "1 person loses editing access" against the live fixture set, and CI reported "2 people lose…" —
 * the warning was correct and the test was counting how many accounts that spec happened to seed.
 * Agreement between a number and its verb is logic, not integration: it belongs here, where every
 * branch can be stated in a line and no fixture can move underneath it.
 *
 * The consequence itself is the point. Role assignments do NOT block a subject-grade delete — they
 * are cascaded away silently — so this sentence is the only warning an administrator gets before
 * revoking other people's access. See the ⚑ in SubjectGradesPanel.tsx.
 */
const row = (editors: number, subjectAdmins: number) => ({
  displayName: 'Biology — Grade 10',
  assignments: { editors, subjectAdmins },
})

describe('deleteConsequences', () => {
  it('says nothing beyond the warning when no grant is attached', () => {
    expect(deleteConsequences(row(0, 0))).toBe('Delete Biology — Grade 10? This cannot be undone.')
  })

  it('agrees in number for a single holder', () => {
    expect(deleteConsequences(row(1, 0))).toContain('1 person loses editing access')
  })

  it('agrees in number for several holders', () => {
    expect(deleteConsequences(row(3, 0))).toContain('3 people lose editing access')
  })

  it('names a Subject Administrator demotion on its own', () => {
    const message = deleteConsequences(row(0, 1))
    expect(message).toContain('1 Subject Administrator is demoted')
    expect(message).not.toContain('editing access')
  })

  it('joins both consequences when both apply', () => {
    expect(deleteConsequences(row(2, 1))).toBe(
      'Delete Biology — Grade 10? 2 people lose editing access and 1 Subject Administrator is demoted. This cannot be undone.',
    )
  })

  /**
   * ⚑ Policy says at most one Subject Administrator per subject-grade, but the demote path can
   * transiently leave more, and `assignmentCountsBySubjectGrade` counts rather than assumes. A
   * warning that reads "2 Subject Administrator is demoted" at the exact moment the data is unusual
   * is the wrong thing to ship, so the plural branch is real and pinned.
   */
  it('pluralises administrators too, rather than assuming the ≤1 policy holds', () => {
    expect(deleteConsequences(row(0, 2))).toContain('2 Subject Administrators are demoted')
  })
})
