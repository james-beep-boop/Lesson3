/**
 * Selection rules for Manage's "Delete lesson plans" panel — the tri-state group checkboxes, the
 * hidden-selection count, and what a given selection is a delete of.
 *
 * Pure and separate from the component on purpose (2026-08-04): the invariant that matters on this
 * panel is that **the delete loop sends exactly what the checkboxes claim**, and that is an assertion
 * about set arithmetic, not about a browser. Tested directly in tests/unit/planSelection.spec.ts;
 * `tests/e2e/manage.e2e.spec.ts` is left to cover only what needs a real page (the wire delete, and
 * that searching removes the group controls).
 *
 * ⚑ A "strand" is NOT an entity here — it is derived from the Official version's `meta.substrand_id`
 * and `unit.strand` (see lib/substrand.ts). A SubjectGrade *is* an entity, but `guardSubjectGradeDelete`
 * (collections/SubjectGrade.ts) refuses to delete one while plans still reference it. So every "group"
 * below means SELECT ALL PLANS IN IT, and deleting a group deletes plans + their versions and leaves
 * the taxonomy alone — which is precisely the step that guard's error message asks the operator to take.
 */
import type { CurriculumRow, StrandGroup, SubjectGradeGroup } from './substrand'

/** A curriculum row that can be selected: the panel keys selection on the LESSON PLAN id. */
export interface SelectableRow extends CurriculumRow {
  id: number
}

/** A group checkbox's three states — `some` renders as the native `indeterminate` dash. */
export type GroupState = 'none' | 'some' | 'all'

/** "N lesson plan(s)" — one home for the count phrase the panel and its confirmation both state. */
export const planCount = (n: number): string => `${n} lesson plan${n === 1 ? '' : 's'}`

/** Every plan id in a strand, in render order. */
export const strandIds = (strand: StrandGroup<SelectableRow>): number[] =>
  strand.rows.map((r) => r.id)

/** Every plan id in a subject-grade, across all of its strands, in render order. */
export const subjectGradeIds = (sg: SubjectGradeGroup<SelectableRow>): number[] =>
  sg.strands.flatMap((st) => strandIds(st))

/** An EMPTY group is `none`, never `all` — `every` on an empty array is vacuously true, which would
 *  otherwise tick a group containing nothing and offer a delete of zero plans. */
export function groupState(ids: readonly number[], selected: ReadonlySet<number>): GroupState {
  if (ids.length === 0) return 'none'
  let hits = 0
  for (const id of ids) if (selected.has(id)) hits++
  if (hits === 0) return 'none'
  return hits === ids.length ? 'all' : 'some'
}

/**
 * Toggle a whole group: select every id under it unless they are ALREADY all selected, in which case
 * clear them. A partially-selected group therefore fills rather than empties — the standard
 * indeterminate-checkbox behaviour, and the safer one (it never silently drops a pick).
 * Returns a new Set; `selected` is not mutated.
 */
export function toggleGroup(selected: ReadonlySet<number>, ids: readonly number[]): Set<number> {
  const next = new Set(selected)
  if (groupState(ids, selected) === 'all') for (const id of ids) next.delete(id)
  else for (const id of ids) next.add(id)
  return next
}

/**
 * How many selected plans the current filter is hiding. The button's count covers the whole
 * selection, so without this an administrator could search, see two rows, and delete three.
 */
export function hiddenSelectedCount(
  selected: ReadonlySet<number>,
  visible: readonly { id: number }[],
): number {
  const shown = new Set(visible.map((r) => r.id))
  let hidden = 0
  for (const id of selected) if (!shown.has(id)) hidden++
  return hidden
}

/** What the current selection amounts to — drives the confirmation copy. */
export interface DeleteScope {
  count: number
  /** Set only when the selection is EXACTLY one whole group (and more than one plan). */
  kind: 'subjectGrade' | 'strand' | null
  label: string | null
}

const coversExactly = (ids: readonly number[], selected: ReadonlySet<number>): boolean =>
  ids.length === selected.size && ids.every((id) => selected.has(id))

/**
 * Name the group when the selection is exactly one complete subject-grade or strand, so the
 * confirmation can say WHAT is being deleted rather than only how much.
 *
 * At most one group can match at any level (plan ids are disjoint across the tree), so the first hit
 * wins. A subject-grade is tested before its own strands: when it holds a single strand the two id
 * sets are identical, and the broader label is the truer description of what disappears.
 *
 * A one-plan selection is never framed as a group even when it is a strand's only member — "ALL 1
 * lesson plan in Strand 3" is worse copy than "1 lesson plan", and it is also the case that skips the
 * typed confirmation, so the group framing would buy nothing.
 */
export function deleteScope(
  groups: readonly SubjectGradeGroup<SelectableRow>[],
  selected: ReadonlySet<number>,
): DeleteScope {
  const count = selected.size
  if (count > 1) {
    for (const sg of groups) {
      if (coversExactly(subjectGradeIds(sg), selected)) {
        return { count, kind: 'subjectGrade', label: sg.label }
      }
      for (const st of sg.strands) {
        if (coversExactly(strandIds(st), selected)) {
          return { count, kind: 'strand', label: `${st.label} (${sg.label})` }
        }
      }
    }
  }
  return { count, kind: null, label: null }
}

/** The confirmation's lead sentence. The "cannot be undone" line is fixed copy in the dialog. */
export function deleteScopeSentence({ count, label }: DeleteScope): string {
  const versions = `all of ${count === 1 ? 'its' : 'their'} saved versions`
  if (label) return `Delete ALL ${planCount(count)} in ${label}, including ${versions}.`
  return `Delete ${planCount(count)}, including ${versions}.`
}
