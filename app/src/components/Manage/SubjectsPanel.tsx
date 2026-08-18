'use client'

/**
 * Manage → Subjects (design PR 3). A Subject is an academic discipline and nothing else — grade
 * lives on SubjectGrade (SPEC §8), which is why this panel edits exactly one field.
 *
 * Server-loaded, unlike the Users panel: D11 makes only Users lazy and keeps every bounded panel
 * server-rendered. A curriculum is tens of rows, so the list arrives with the page and the search
 * below filters what is already here rather than issuing a request per keystroke.
 */
import React, { useMemo, useState } from 'react'
import { Button } from '@payloadcms/ui'

import { plural } from '../../lib/assignmentCounts'
import { matchesTokenAnd, tokenise } from '../../lib/substrand'
import { useTaxonomyActions } from './taxonomyActions'

export interface SubjectRow {
  id: number
  name: string
  /** Subject-grades that still belong to it — what `guardSubjectDelete` will refuse the delete on. */
  subjectGradeCount: number
}

function SubjectItem({
  subject,
  actions,
}: {
  subject: SubjectRow
  actions: ReturnType<typeof useTaxonomyActions>
}) {
  const [name, setName] = useState(subject.name)
  const [observed, setObserved] = useState(subject.name)
  const disabled = actions.busy !== null

  // Adopt a refreshed server row without an effect, the same rule the Users panel follows: an effect
  // paints the stale value once and then corrects it.
  if (observed !== subject.name) {
    setObserved(subject.name)
    setName(subject.name)
  }

  // ⚑ ONE predicate for the guard AND the control. Written twice they had already drifted in the
  // sibling panel — the button enabled for input the handler then silently rejected, so a click did
  // nothing and said nothing.
  const canSave = !disabled && name.trim() !== '' && name.trim() !== subject.name

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSave) return
    void actions.rename(subject.id, { name: name.trim() }, `Renamed to ${name.trim()}.`)
  }

  const remove = () => {
    // ⚑ NO CONSEQUENCE LIST HERE, deliberately, and the asymmetry with the Subject grades panel is
    // the point: a Subject with subject-grades CANNOT be deleted — `guardSubjectDelete` refuses with
    // a 409 naming the count — so there is no silent cascade to warn about. The only deletable
    // Subject is an empty one.
    if (!window.confirm(`Delete ${subject.name}? This cannot be undone.`)) return
    void actions.remove(subject.id, `Deleted ${subject.name}.`)
  }

  return (
    <li className="lp-manage__row lp-manage__row--tight">
      <form className="lp-taxonomy__form" onSubmit={save}>
        <label className="lp-taxonomy__field">
          <span className="lp-taxonomy__label">Subject</span>
          <input
            className="lp-users__input"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <Button
          className="lp-btn lp-btn--compact"
          buttonStyle="primary"
          size="small"
          type="submit"
          disabled={!canSave}
        >
          Save
        </Button>
      </form>
      <span className="lp-manage__meta">{plural(subject.subjectGradeCount, 'subject grade')}</span>
      {/* ⚑ Per-row accessible name. The visible label is only "Delete", and this row identifies its
          subject through an INPUT VALUE — which is not text content, so neither a screen reader's
          button list nor a test locator can tell two rows apart without this. */}
      <Button
        className="lp-btn lp-btn--compact"
        buttonStyle="error"
        size="small"
        disabled={disabled}
        aria-label={`Delete ${subject.name}`}
        onClick={remove}
      >
        Delete
      </Button>
    </li>
  )
}

export function SubjectsPanel({ subjects }: { subjects: SubjectRow[] }) {
  const actions = useTaxonomyActions('subjects')
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')

  // ⚑ THE PRODUCT'S SEARCH RULE, not a substring test. `lib/substrand.ts` states plainly that
  // `tokenise`/`matchesTokenAnd` is THE rule "for the whole product… two boxes that disagree about
  // what a query means is worse than either rule on its own" — and Manage now runs FOUR search boxes
  // on one page, behind the same `.lp-admin-list__search` class. Tokenised once OUTSIDE the filter,
  // per that module's own note about re-splitting per row.
  const shown = useMemo(() => {
    const tokens = tokenise(query)
    return tokens.length === 0 ? subjects : subjects.filter((s) => matchesTokenAnd(s.name, tokens))
  }, [query, subjects])

  const canAdd = actions.busy === null && newName.trim() !== ''

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canAdd) return
    const name = newName.trim()
    // Clear only on success — a refused create keeps what was typed, so the message can be read
    // beside the value that caused it.
    if (await actions.create({ name }, `Added ${name}.`)) setNewName('')
  }

  return (
    <div className="lp-taxonomy">
      {/* ⚑ NAMED. Both taxonomy panels are mounted at once (the accordion hides, it does not
          unmount), so this page carries two create forms whose first control is labelled "Subject".
          Without a name on the form they are indistinguishable — in a screen reader's form list, and
          to any locator that has to pick one. */}
      <form className="lp-taxonomy__create" aria-label="Add a subject" onSubmit={add}>
        <label className="lp-taxonomy__field">
          <span className="lp-taxonomy__label">New subject</span>
          <input
            className="lp-users__input"
            placeholder="For example, Biology"
            value={newName}
            disabled={actions.busy !== null}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>
        <Button
          className="lp-btn"
          buttonStyle="primary"
          size="small"
          type="submit"
          disabled={!canAdd}
        >
          {actions.busy === 'create' ? 'Adding…' : 'Add subject'}
        </Button>
      </form>

      {subjects.length > 0 && (
        <input
          className="lp-admin-list__search"
          type="search"
          aria-label="Search subjects"
          placeholder="Search subjects…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}

      {actions.error && (
        <p className="lp-manage__error" role="alert">
          {actions.error}
        </p>
      )}

      {subjects.length === 0 ? (
        <p className="lp-manage__empty">No subjects yet.</p>
      ) : shown.length === 0 ? (
        <p className="lp-manage__empty">No subjects match this search.</p>
      ) : (
        <ul className="lp-manage__list">
          {shown.map((subject) => (
            <SubjectItem key={subject.id} subject={subject} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  )
}
