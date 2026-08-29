import { describe, expect, it } from 'vitest'

import { LessonBundleVersions } from '../../src/collections/LessonBundleVersions'
import type { LooseField } from '../helpers/fieldTree'

/**
 * Every collapsed-by-default panel in the version editor carries the entry rule — and no array row
 * does, because rows are corrected by the other half of the mechanism.
 *
 * ⚑ A DRIFT TEST, not a spot check, because the defect belongs to `collapsible` rather than to any
 * one panel. Payload prefers a stored per-user preference over `initCollapsed` and rewrites that
 * preference on every toggle, so a panel that opens compact for a first-time reader opens EXPANDED
 * for a returning one. Three panels had it — Final explanation, Summary table, and Plan and
 * sub-strand details — and each was found separately, the last one only because the first two were
 * being fixed. A fourth would be found by a user.
 *
 * Enumerating the panels here instead would just move the omission: the next author adds a panel and
 * not a line in this list. Deriving both expectations from the field tree means the rule holds for
 * panels nobody has written yet.
 *
 * ⚑ THE WALK IS RECURSIVE ON BOTH SIDES, which it was not when first written. A top-level
 * `fields.filter(f => f.type === 'array')` matches exactly ONE of this collection's six arrays
 * (`lessons`); `sections`, `rubric` and the summary table's `lessons` are nested INSIDE the two
 * panels this rule is about — which is precisely where someone would reach for the wrong mechanism,
 * and it would have passed unchecked. A negative guard asserted over a sixth of its population is
 * not a guard.
 */

const childrenOf = (field: LooseField): LooseField[] => field.fields ?? []

/** A readable ancestry path for a field, so a failing case names which panel or array it is. */
const labelOf = (field: LooseField): string =>
  typeof field.label === 'string' ? field.label : (field.name ?? field.type ?? '?')

/** Every field in the tree, paired with its path. One traversal, both questions asked of it. */
const walk = (fields: readonly LooseField[], path: string[] = []): [string, LooseField][] =>
  fields.flatMap((field) => {
    const here = [...path, labelOf(field)]
    const entry: [string, LooseField] = [here.join(' › '), field]
    return [entry, ...walk(childrenOf(field), here)]
  })

const hasEntryRule = (field: LooseField): boolean =>
  childrenOf(field).some((child) => child.type === 'ui' && child.name === 'collapseOnEntry')

describe('collapsed-by-default panels start compact on every visit', () => {
  const everyField = walk(LessonBundleVersions.fields as LooseField[])
  const panels = everyField.filter(
    ([, field]) => field.type === 'collapsible' && field.admin?.initCollapsed === true,
  )
  const arrays = everyField.filter(([, field]) => field.type === 'array')

  // If either walk ever comes back short, the cases below are vacuous and would still show green.
  it('finds the editor panels and arrays to check', () => {
    expect(panels.length).toBeGreaterThanOrEqual(3)
    expect(arrays.length).toBeGreaterThanOrEqual(6)
  })

  // ⚑ The pair goes into `it.each` whole. Passing only the name and looking the panel back up would
  // alias two panels whose ancestry paths collide onto the same field — one asserted twice, the
  // other not at all, both green.
  it.each(panels)('%s carries collapseOnEntry', (_path, panel) => {
    expect(hasEntryRule(panel)).toBe(true)
  })

  // Array ROWS are a different mechanism with the same intent: `initialCollapseActions` corrects them
  // through form state, so they must NOT also carry this field. Named here so the two halves of
  // "each visit starts compact" stay legible as two halves.
  it.each(arrays)('%s leaves its rows to the form-state correction', (_path, array) => {
    expect(hasEntryRule(array)).toBe(false)
  })
})
