/**
 * Whitelist ↔ field-schema drift guard (audit 2026-07-04, Phase 2 invariant tripwires).
 *
 * The Editor/Admin boundary is enforced by the WHITELIST in `hooks/fieldSplit.ts` (the `*_PROSE`
 * constants), NOT by Payload field access. That whitelist is hand-kept in sync with the `prose()`
 * fields in `fields/lessonContent.ts` via a "keep in sync" comment — exactly the kind of coupling
 * that silently rots. This test makes the sync mechanical: `prose()` is the ONLY field factory that
 * attaches `access.update === canEditProse` (verified: `proseAdmin`/`structureText` attach none),
 * so "fields the schema intends as Editor-editable" is computable by walking the field tree and
 * collecting the `canEditProse`-guarded leaves per container. That set must equal the whitelist.
 *
 * A drift fails HERE (fast, named) instead of leaking as a silently-dropped edit or — worse — a
 * newly Editor-writable admin field. DB-free → `test:unit`.
 */
import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'

import { lessonContentFields } from '../../src/fields/lessonContent'
import { canEditProse } from '../../src/access/bundle'
import {
  FINAL_EXPLANATION_PROSE,
  FRAMEWORK_PROSE,
  LESSON_PROSE,
  SECTION_PROSE,
  SLO_PROSE,
  SUMMARY_LESSON_PROSE,
  SUMMARY_PROMPT_PROSE,
} from '../../src/hooks/fieldSplit'

/** A field whose `access.update` is the shared `canEditProse` guard — i.e. built by `prose()`. */
const isProseField = (f: Field): boolean =>
  (f as { access?: { update?: unknown } }).access?.update === canEditProse

/** Named-field children of a group/array field (skips row-label UI, etc.). */
const childrenOf = (f: Field): Field[] => ((f as { fields?: Field[] }).fields ?? [])

/** Direct prose-field names within a container's field list. */
const proseNamesIn = (fields: Field[]): string[] =>
  fields.filter(isProseField).map((f) => (f as { name: string }).name).sort()

/** Find a named field within a list. */
const byName = (fields: Field[], name: string): Field =>
  fields.find((f) => (f as { name?: string }).name === name) as Field

describe('prose() fields ↔ fieldSplit whitelist stay in sync', () => {
  const lessons = byName(lessonContentFields, 'lessons')
  const lessonFields = childrenOf(lessons)
  const finalExplanation = childrenOf(byName(lessonContentFields, 'finalExplanation'))
  const summaryTable = childrenOf(byName(lessonContentFields, 'summaryTable'))

  it('LESSON_PROSE matches the lesson group', () => {
    expect(proseNamesIn(lessonFields)).toEqual([...LESSON_PROSE].sort())
  })

  it('SLO_PROSE matches the slo group', () => {
    expect(proseNamesIn(childrenOf(byName(lessonFields, 'slo')))).toEqual([...SLO_PROSE].sort())
  })

  it('FRAMEWORK_PROSE matches the framework row', () => {
    expect(proseNamesIn(childrenOf(byName(lessonFields, 'framework')))).toEqual(
      [...FRAMEWORK_PROSE].sort(),
    )
  })

  it('SUMMARY_PROMPT_PROSE matches the summaryTablePrompt group', () => {
    expect(proseNamesIn(childrenOf(byName(lessonFields, 'summaryTablePrompt')))).toEqual(
      [...SUMMARY_PROMPT_PROSE].sort(),
    )
  })

  it('FINAL_EXPLANATION_PROSE + SECTION_PROSE match the finalExplanation group', () => {
    expect(proseNamesIn(finalExplanation)).toEqual([...FINAL_EXPLANATION_PROSE].sort())
    expect(proseNamesIn(childrenOf(byName(finalExplanation, 'sections')))).toEqual(
      [...SECTION_PROSE].sort(),
    )
  })

  it('SUMMARY_LESSON_PROSE matches the summaryTable lesson rows', () => {
    expect(proseNamesIn(childrenOf(byName(summaryTable, 'lessons')))).toEqual(
      [...SUMMARY_LESSON_PROSE].sort(),
    )
  })

  it('sanity: prose()/proseAdmin/structureText are distinguishable by the canEditProse guard', () => {
    // If proseAdmin or structureText ever started attaching canEditProse, the walk above would
    // over-count and every assertion would still need to hold — pin the premise directly.
    const exemplar = childrenOf(byName(finalExplanation, 'sections')).find(
      (f) => (f as { name?: string }).name === 'exemplar',
    )
    expect(exemplar).toBeDefined()
    expect(isProseField(exemplar!)).toBe(false) // proseAdmin answer key — NOT Editor prose
  })
})
