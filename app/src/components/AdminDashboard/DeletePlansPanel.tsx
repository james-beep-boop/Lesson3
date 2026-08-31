'use client'

/**
 * Manage — Site-Admin "Delete lesson plans" panel (browse/search → select → confirm → delete).
 *
 * ORGANISATION (2026-08-04, operator request): the same subject-grade → strand → sub-strand tree the
 * library catalogue renders, via the SAME `groupLessons` (lib/substrand.ts) — so the two views can
 * never drift on ordering or on what a group is called. Rows stay one simple line: checkbox,
 * sub-strand number, name. The scope no longer rides on the right of each row; it is the heading.
 * Group checkboxes SELECT PLANS — see the ⚑ in lib/planSelection.ts on why deleting a "strand" or a
 * "subject grade" here means deleting its plans and leaving the taxonomy alone.
 *
 * While a search is active the list goes FLAT (curriculum-ordered, with the scope inline) and the
 * group checkboxes disappear. That is deliberate: a group checkbox beside filtered results reads
 * ambiguously as either "all 12 plans in this strand" or "the 2 you can see", and both readings are
 * dangerous on a delete control. Group selection belongs to the unfiltered tree.
 *
 * The delete semantics are carried over VERBATIM from AdminLessonCatalogue: one plan at a time via the
 * by-ID endpoint, fail-fast. Each by-ID delete is its OWN transaction, so the cascade
 * (`cascadeDeleteLessonPlanVersions` beforeDelete → child versions, then the plan) is atomic per plan
 * and rolls back fully on failure. Payload's BULK delete is unusable here: with
 * `bulkOperationsSingleTransaction=false` (the Postgres default) all docs share one transaction that is
 * committed even when a per-doc error is swallowed into `errors` — so a failed plan delete could still
 * commit its already-removed child versions. Server access (`lessonPlanDelete`, Site-Admin only)
 * remains the authority. The consequence of per-plan transactions is that a GROUP delete can partially
 * complete, which is why the control reports "Deleting 7 of 24…" rather than a static "Deleting…".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import Modal from '../Modal'
import { apiBaseFrom } from '../../lib/apiBase'
import { curriculumContextLabel, filterRows, groupLessons, orderLessons } from '../../lib/substrand'
import {
  deleteScope,
  deleteScopeSentence,
  groupState,
  hiddenSelectedCount,
  planCount,
  strandIds,
  subjectGradeIds,
  toggleGroup,
  type DeleteScope,
  type SelectableRow,
} from '../../lib/planSelection'

/** One deletable lesson plan: its id plus the curriculum coordinates the tree groups it by. */
export type PlanRow = SelectableRow

/** The word the confirmation asks for above one plan. Compared case-insensitively, trimmed. */
const CONFIRM_WORD = 'DELETE'

export function DeletePlansPanel({ rows }: { rows: PlanRow[] }) {
  const router = useRouter()
  const { config } = useConfig()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  /** 1-based index of the plan currently in flight, so the control can name its progress through a
   *  24-plan group. Stored in-flight rather than as a completed count: "Deleting 7 of 24…" then reads
   *  straight off it, with no +1 and no clamp to stop the last tick claiming "25 of 24". */
  const [attempt, setAttempt] = useState(0)
  const [confirming, setConfirming] = useState(false)

  const query = q.trim()
  const searching = query !== ''
  // Grouped ALWAYS (not just when unfiltered): the tree is what `deleteScope` matches a selection
  // against to name it, and a selection made before typing is still a whole-strand selection.
  const groups = useMemo(() => groupLessons(rows), [rows])
  // Search reuses the catalogue's own filter + order, so a match here means what it means there
  // (token-AND over sub-strand id, name, strand, subject and "grade N").
  const visible = useMemo(
    () => (searching ? orderLessons(filterRows(rows, { q: query })) : rows),
    [rows, query, searching],
  )
  // Only a search can hide a selected row: unfiltered, `visible` IS `rows`, so the answer is
  // definitionally 0 and the id Set behind it need never be built.
  const hidden = searching ? hiddenSelectedCount(selected, visible) : 0

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onDelete = async () => {
    setConfirming(false)
    setBusy(true)
    const apiBase = apiBaseFrom(config)
    // The ids actually removed, recorded as it happens. The previous version re-derived them from the
    // selection's iteration order (`slice(deleted)`), which quietly made "`toggleGroup` appends" a
    // cross-module invariant of a pure set-arithmetic library — one that group selection turned
    // load-bearing, since a click can now push 200 ids in at once. Recording the truth where it is
    // known costs one array and owes lib/planSelection.ts nothing.
    const removed: number[] = []
    try {
      let n = 0
      for (const id of selected) {
        setAttempt(++n)
        const res = await fetch(`${apiBase}/lesson-plans/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as {
            errors?: { message: string }[]
          } | null
          const msg = json?.errors?.[0]?.message || `Delete failed (${res.status})`
          throw new Error(removed.length > 0 ? `${msg} (after deleting ${removed.length})` : msg)
        }
        removed.push(id)
      }
      toast.success(`Deleted ${planCount(removed.length)}.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      // Refresh regardless — some may have committed before a mid-batch failure, so the list must
      // reflect reality. Drop exactly the deleted ids from the selection (full success → clears it;
      // partial → leaves the not-yet-tried ids so a re-click retries only those).
      if (removed.length > 0) {
        const gone = new Set(removed)
        setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))))
      }
      router.refresh()
      setBusy(false)
    }
  }

  const total = selected.size
  const deleteLabel = busy
    ? `Deleting ${attempt} of ${total}…`
    : `Delete selected${total ? ` (${total})` : ''}`

  return (
    <div className="lp-delete-plans">
      <div className="lp-admin-list__bar">
        <input
          className="lp-admin-list__search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lesson plans"
          aria-label="Search lesson plans to delete"
        />
        {/* Selection survives a search, so it needs a visible way out — without it an administrator
            can search, see two rows, and delete three. The count below names the discrepancy; this
            resolves it. */}
        {total > 0 && (
          <Button
            className="lp-btn"
            buttonStyle="secondary"
            size="small"
            disabled={busy}
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
        )}
        <Button
          className="lp-btn"
          buttonStyle="error"
          size="small"
          disabled={busy || total === 0}
          onClick={() => setConfirming(true)}
        >
          {deleteLabel}
        </Button>
      </div>

      {hidden > 0 && (
        <p className="lp-delete-plans__hidden">
          {planCount(hidden)} selected but not shown by this search.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="muted">
          {searching ? `No lesson plans match “${query}”.` : 'No lesson plans.'}
        </p>
      ) : searching ? (
        <ul className="lp-manage__list">
          {visible.map((r) => (
            <PlanLine
              key={r.id}
              row={r}
              checked={selected.has(r.id)}
              onToggle={toggle}
              disabled={busy}
              showScope
            />
          ))}
        </ul>
      ) : (
        groups.map((sg) => {
          const sgIds = subjectGradeIds(sg)
          return (
            <section key={sg.key} className="lp-delete-plans__group">
              {/* h4/h5 under the section's h3 "Delete lesson plans": the group's checkbox is the
                  affordance, but the outline still has to read as an outline. */}
              <h4 className="lp-delete-plans__group-head">
                <GroupPick
                  label={sg.label}
                  ids={sgIds}
                  selected={selected}
                  disabled={busy}
                  onChange={setSelected}
                />
              </h4>
              {sg.strands.map((st) => {
                const ids = strandIds(st)
                return (
                  <div key={st.key} className="lp-delete-plans__strand">
                    <h5 className="lp-delete-plans__strand-head">
                      {/* `context` is the subject-grade: strand labels are NOT unique across the
                          page ("Other" appears under every subject-grade holding a plan with no
                          Official version, and two subjects can share a strand name), so without it
                          several destructive controls would announce the same name. */}
                      <GroupPick
                        label={st.label}
                        context={sg.label}
                        ids={ids}
                        selected={selected}
                        disabled={busy}
                        onChange={setSelected}
                      />
                    </h5>
                    <ul className="lp-manage__list">
                      {st.rows.map((r) => (
                        <PlanLine
                          key={r.id}
                          row={r}
                          checked={selected.has(r.id)}
                          onToggle={toggle}
                          disabled={busy}
                        />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </section>
          )
        })
      )}

      {/* `deleteScope` is computed HERE, not at the top of the component: it is read only by the
          dialog, and hoisted it walked every group on every keystroke and every checkbox click. */}
      {confirming && (
        <ConfirmDelete
          scope={deleteScope(groups, selected)}
          hidden={hidden}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void onDelete()}
        />
      )}
    </div>
  )
}

/**
 * A group heading's checkbox + label: owns its own tri-state and toggle, so the two call sites pass
 * the group's ids and nothing else. `indeterminate` has no React prop — it is set on the node.
 *
 * Naming: the checkbox takes its accessible name from THIS LABEL'S TEXT, with `context` supplied as
 * visually-hidden text — no `aria-label`. That is what keeps two same-named strands ("Other" appears
 * under every subject-grade holding a pointerless plan) distinguishable to a screen-reader user before
 * they trigger a destructive control, while sighted users read the context off the enclosing heading.
 *
 * ⚑ An `aria-label` here would be WRONG, not merely different: the control sits inside the <h4>/<h5>,
 * and a heading's accessible name is computed from its contents — so the label text and the aria-label
 * BOTH landed in it, and the heading announced "Select all plans in Biology · Grade 10 Biology ·
 * Grade 10". One source of text means the heading announces its own name exactly once.
 */
function GroupPick({
  label,
  context,
  ids,
  selected,
  disabled,
  onChange,
}: {
  label: string
  /** Disambiguator appended to the accessible name — the subject-grade, for strand groups. */
  context?: string
  ids: readonly number[]
  selected: ReadonlySet<number>
  disabled: boolean
  onChange: (next: (prev: Set<number>) => Set<number>) => void
}) {
  const state = groupState(ids, selected)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <label className="lp-manage__pick">
      <input
        ref={ref}
        type="checkbox"
        className="lp-admin-list__check"
        checked={state === 'all'}
        disabled={disabled}
        onChange={() => onChange((prev) => toggleGroup(prev, ids))}
      />
      <span>{label}</span>
      {/* Reads as a phrase, not punctuation: name computation joins sibling text with a SPACE, so a
          leading comma here announced "…Biodiversity , Biology · Grade 10". "in <subject-grade>"
          needs no leading punctuation and says the relationship out loud. */}
      {context && <span className="lp-sr-only">in {context}</span>}
    </label>
  )
}

/**
 * One plan: checkbox, sub-strand number, name — plus its scope only in the flat search view.
 *
 * Locked while a delete runs, like the group checkboxes. Not for correctness — the loop iterates the
 * selection captured at confirm time and the recovery filters exactly the ids it removed, so a
 * mid-flight change is handled either way — but because a run is already committed to its list, and
 * boxes that still moved would imply the operator could change its mind halfway through.
 */
function PlanLine({
  row,
  checked,
  onToggle,
  disabled,
  showScope = false,
}: {
  row: PlanRow
  checked: boolean
  onToggle: (id: number) => void
  disabled: boolean
  showScope?: boolean
}) {
  // Only the flat search view shows the scope, and that is the minority of rendered rows — computing
  // it unconditionally ran `cleanStrandName`'s regex over the WHOLE corpus to throw the result away.
  const scope = showScope ? curriculumContextLabel(row) : ''
  return (
    <li className="lp-manage__row lp-manage__row--tight">
      <label className="lp-manage__pick">
        <input
          type="checkbox"
          className="lp-admin-list__check"
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle(row.id)}
          aria-label={`Select ${row.substrandName}`}
        />
        {/* Always rendered, even when a plan has no Official version to take a number from, so the
            names stay in one column rather than stepping in and out by 2.6rem. */}
        <span className="lp-delete-plans__num">{row.substrandId}</span>
        <span>{row.substrandName}</span>
      </label>
      {scope && <span className="lp-manage__meta">{scope}</span>}
    </li>
  )
}

/**
 * The confirmation. Always names what is being deleted and always says it cannot be undone; above one
 * plan it also requires the word DELETE to be typed.
 *
 * Typing a WORD rather than transcribing the target's name is deliberate (2026-08-04): the group
 * labels here contain "·" (Option+Shift+9 on a Mac), so a transcription gate would in practice be a
 * copy-and-paste gate — less deliberate than typing, not more. Verification comes from the dialog
 * naming the target in prose; the typed word supplies the intent.
 */
function ConfirmDelete({
  scope,
  hidden,
  onCancel,
  onConfirm,
}: {
  scope: DeleteScope
  hidden: number
  onCancel: () => void
  onConfirm: () => void
}) {
  // Owned here, not by the panel: this component unmounts on cancel and on confirm, so the field
  // resets by construction rather than by a `setTyped('')` the next caller has to remember.
  const [typed, setTyped] = useState('')
  const needsTyped = scope.count > 1
  const ready = !needsTyped || typed.trim().toUpperCase() === CONFIRM_WORD
  return (
    <Modal title="Delete lesson plans" onClose={onCancel} className="lp-confirm modal--plain">
      <p>{deleteScopeSentence(scope)}</p>
      {hidden > 0 && (
        <p className="modal__body">
          {hidden} of them {hidden === 1 ? 'is' : 'are'} not shown by the current search.
        </p>
      )}
      {scope.kind === 'subjectGrade' && (
        <p className="modal__body">
          The subject grade itself stays. Once it is empty you can delete it from Curriculum &amp;
          people.
        </p>
      )}
      <p className="lp-confirm__warn">This cannot be undone.</p>
      {needsTyped && (
        <label className="modal__field">
          <span>
            Type <code>{CONFIRM_WORD}</code> to confirm
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-label={`Type ${CONFIRM_WORD} to confirm`}
          />
        </label>
      )}
      <div className="modal__actions lp-confirm__actions">
        <Button className="lp-btn" buttonStyle="secondary" size="small" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="lp-btn"
          buttonStyle="error"
          size="small"
          disabled={!ready}
          onClick={onConfirm}
        >
          Delete
        </Button>
      </div>
    </Modal>
  )
}
