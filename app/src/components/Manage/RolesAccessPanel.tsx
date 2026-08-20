'use client'

/**
 * Manage → Roles & Access (design PR 4). One group per subject-grade in the caller's scope: who
 * administers it, who may edit it, and the controls to change both.
 *
 * Writes go through the narrow assignment endpoints (`POST /api/users/:id/{assign,unassign}-{editor,
 * subject-admin}`) with the REQUIRED `expectedUpdatedAt` freshness token — the server rejects a stale
 * page (409) and applies a one-row delta to the FRESH user row, so a concurrent administrator's role
 * change can never be silently overwritten.
 *
 * ⚑ AUTHORIZATION IS ENTIRELY SERVER-SIDE and this panel adds none of it. `maySetSubjectAdmin` below
 * decides what is DRAWN, never what is permitted: the routes assert Site Admin themselves, and
 * `enforceAssignmentScope` refuses a non-Site-Admin touching a `subjectAdmin` row on every other
 * write path including the generic PATCH (D6a). Both are pinned in `tests/http`.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { assignmentAction } from '../../lib/assignmentRoles'
import { grantRoleLabel } from '../../lib/userSearchContract'
import { matchesTokenAnd, tokenise } from '../../lib/substrand'
import { personLabel, type WidgetUser } from '../../lib/widgetUser'
import { wireErrorMessage } from '../../lib/wireError'
import type { RolesAccess, RolesAccessGroup } from '../../lib/editorGroups'
import { useJumpTarget } from './Accordion'
import { subjectGradeAnchor } from './panelState'

/**
 * ⚑ `canSetSubjectAdmin` IS A PROP, not a field of `access`. It first rode inside `RolesAccess`, the
 * return type of `lib/editorGroups.ts` — the projection whose whole docblock is that its role gate,
 * trusted query and client projection must not be separable, and whose privacy predicate is
 * deliberately named rather than reusing a general `isAdmin` so that widening it for a PRESENTATIONAL
 * reason cannot silently widen an email disclosure. Putting a presentational capability in that
 * return type creates exactly the reverse coupling: the first person who wants "Subject Admins may
 * vacate but not appoint" edits a boolean inside the carve-out function. The render site already has
 * `siteAdmin` in scope and gates every other Site-Admin panel with it.
 */
/**
 * ⚑ ONE SPELLING, from `grantRoleLabel`. The panel hand-wrote "Subject Administrator" in a label, four
 * aria-labels, two confirmations and a toast, while the Users panel rendered the same grant through
 * `grantRoleLabel` — so Manage showed two spellings of one role on one page. That helper's docblock
 * already says the wording lives there rather than inline "because a third hand-written copy on a
 * third surface is exactly what the vocabulary sweep was cleaning up".
 */
const SUBJECT_ADMIN = grantRoleLabel('subjectAdmin')

export function RolesAccessPanel({
  access,
  canSetSubjectAdmin,
}: {
  access: RolesAccess
  canSetSubjectAdmin: boolean
}) {
  const router = useRouter()
  const { config } = useConfig()
  const [busy, setBusy] = useState(false)
  /**
   * ⚑ THE REFUSAL STAYS ON SCREEN. Both sibling panels render `.lp-manage__error` — a class promoted
   * out of the `.lp-users` namespace in PR 3 precisely because it is "the one element in these panels
   * that MUST be noticed" — while this one was toast-only. On a single accordion page that meant a
   * 409 from Subject grades sat beside its row while a 409 from here vanished on a timer.
   */
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  /** One pending pick per group, per picker (keyed by subject-grade id). */
  const [editorPicks, setEditorPicks] = useState<Record<number, string>>({})
  const [adminPicks, setAdminPicks] = useState<Record<number, string>>({})

  const apiBase = apiBaseFrom(config)
  const { target: jumpTarget, consume: consumeJumpTarget } = useJumpTarget()

  // ⚑ IDS RESOLVE AGAINST ONE ROSTER (D11a). The groups carry id lists, not people, so this map is
  // what turns them back into names — once, rather than the server sending each user once per
  // subject-grade.
  const byId = useMemo(() => new Map(access.roster.map((u) => [u.id, u])), [access.roster])
  useEffect(() => {
    if (!jumpTarget || !access.groups.some((g) => subjectGradeAnchor(g.sgId) === jumpTarget)) return
    // The URL parser already restricts the target grammar, and the membership check above narrows it
    // to a group this caller actually received. Focus the group heading rather than an arbitrary
    // selector supplied by the URL.
    const target = document.getElementById(jumpTarget)
    if (!target) return
    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    if (document.activeElement === target) consumeJumpTarget(jumpTarget)
  }, [access.groups, consumeJumpTarget, jumpTarget])

  const act = async (action: string, user: WidgetUser, group: RolesAccessGroup, okMsg: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/users/${user.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectGradeId: group.sgId, expectedUpdatedAt: user.updatedAt }),
        // ⚑ Both siblings time out; this did not. A hung role write left `busy` true forever, with
        // every control in the panel disabled and no way out but a reload.
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(await wireErrorMessage(res, 'Update failed'))
      toast.success(okMsg)
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Update failed'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  /**
   * ⚑ `personLabel` in every confirmation. Revoking access is the same kind of authorization decision
   * as granting it, and a name-only dialog reads identically for two people who share a display name.
   */
  const removeEditor = (group: RolesAccessGroup, u: WidgetUser) => {
    if (!window.confirm(`Remove editing access for ${personLabel(u)} in ${group.sgLabel}?`)) return
    void act(
      'unassign-editor',
      u,
      group,
      `${personLabel(u)} no longer has editing access for ${group.sgLabel}.`,
    )
  }

  const addEditor = (group: RolesAccessGroup) => {
    const u = byId.get(Number(editorPicks[group.sgId]))
    if (!u) return
    void act(
      'assign-editor',
      u,
      group,
      `${personLabel(u)} now has editing access for ${group.sgLabel}.`,
    )
    setEditorPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  const appointAdmin = (group: RolesAccessGroup) => {
    const u = byId.get(Number(adminPicks[group.sgId]))
    if (!u) return
    // ⚑ EVERY incumbent, not "the" incumbent. The cascade demotes ALL other holders of this
    // subject-grade, and legacy rows can leave more than one (`userRoles.ts`: "legacy rows that
    // violate ≤1 exist by design"). Naming only the first would have understated what the click does
    // in exactly the case where the warning matters most.
    const incumbents = group.subjectAdminIds
      .filter((id) => id !== u.id)
      .map((id) => byId.get(id))
      .filter((p): p is WidgetUser => !!p)
    // ⚑ NAME THE DEMOTION. Appointing a successor demotes the incumbent to editing access through
    // `autoDemotePriorSubjectAdmins` — a consequence of the gentler-sounding action, and exactly the
    // kind of thing D6a's rejected alternative would have made someone do to themselves in one click.
    const warning =
      incumbents.length > 0
        ? `Make ${personLabel(u)} the ${SUBJECT_ADMIN} of ${group.sgLabel}? ${incumbents
            .map(personLabel)
            .join(', ')} ${incumbents.length > 1 ? 'are' : 'is'} demoted to editing access.`
        : `Make ${personLabel(u)} the ${SUBJECT_ADMIN} of ${group.sgLabel}?`
    if (!window.confirm(warning)) return
    void act(
      'assign-subject-admin',
      u,
      group,
      `${personLabel(u)} now administers ${group.sgLabel}.`,
    )
    setAdminPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  const vacateAdmin = (group: RolesAccessGroup, u: WidgetUser) => {
    if (
      !window.confirm(
        `Remove ${personLabel(u)} as ${SUBJECT_ADMIN} of ${group.sgLabel}? It will have no administrator until you appoint one — only Site Administrators can mark its versions Official in the meantime.`,
      )
    ) {
      return
    }
    void act(
      assignmentAction('unassign', 'subjectAdmin'),
      u,
      group,
      `${group.sgLabel} has no ${SUBJECT_ADMIN}.`,
    )
  }

  // Search spans the subject-grade label AND the people in it, because "where is Alice an editor?" is
  // the question this page is opened with as often as "who edits Biology?". Same token-AND rule as
  // every other search box in the product (lib/substrand.ts).
  /**
   * Everything each group needs, resolved ONCE per `access` rather than per render.
   *
   * ⚑ TWO POOLS, NOT ONE. The server sends `grantableIds` (everyone grantable anywhere) and the group's
   * current holders; eligibility differs by picker and both are derived here:
   *   - editing access → people with NO role here (granting to the administrator would silently
   *     demote them, which is not what the gentler-sounding action should do);
   *   - Subject Administrator → those PLUS the group's current editors, because promoting the
   *     subject-grade's existing editor is the common case. The endpoint's appointment branch was
   *     written for exactly that and, with one shared pool, no client could reach it.
   */
  const resolved = useMemo(() => {
    const grantable = access.grantableIds
    return access.groups.map((g) => {
      const held = new Set<number>([...g.editorIds, ...g.subjectAdminIds])
      // ⚑ ONE resolver, declared before its first use. `editors`, `admins` and both picker pools all
      // need "ids → people, dropping any the roster does not carry", and three inline copies of that
      // filter is how they drift.
      const toPeopleSafe = (ids: number[]) =>
        ids.map((id) => byId.get(id)).filter((u): u is WidgetUser => !!u)
      const editors = toPeopleSafe(g.editorIds)
      const free = grantable.filter((id) => !held.has(id))
      return {
        group: g,
        // A LIST since 2026-08-19: the projection reports every holder, because a second one used to
        // be silently dropped. ≤1 is still the policy, so this is normally one entry — but "normally"
        // is not "always", and the old shape could not say so.
        admins: toPeopleSafe(g.subjectAdminIds),
        editors,
        addable: toPeopleSafe(free),
        appointable: toPeopleSafe([...free, ...g.editorIds]),
        // Precomputed so a keystroke costs only `matchesTokenAnd`, not a join per group. Searches
        // `personLabel`, not just names: this is the one panel whose premise (SPEC §8) is that an
        // address is the only real identifier, so "find the person you were just shown" must work.
        searchText: [
          g.sgLabel,
          ...editors.map(personLabel),
          ...toPeopleSafe(g.subjectAdminIds).map(personLabel),
        ].join(' '),
      }
    })
  }, [access.grantableIds, access.groups, byId])

  const shown = useMemo(() => {
    const tokens = tokenise(query)
    return tokens.length === 0
      ? resolved
      : resolved.filter((r) => matchesTokenAnd(r.searchText, tokens))
  }, [query, resolved])

  return (
    <div className="lp-manage__editors">
      {access.groups.length > 1 && (
        <input
          className="lp-admin-list__search"
          type="search"
          aria-label="Search subject grades and people"
          placeholder="Search subject grades or people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {error && (
        <p className="lp-manage__error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 && <p className="lp-manage__empty">Nothing matches this search.</p>}

      {shown.map(({ group, admins, editors, addable, appointable }) => {
        // One option list per pool, built here rather than inline in each <select>.
        const optionsFor = (people: WidgetUser[]) =>
          people.map((u) => (
            <option key={u.id} value={u.id}>
              {personLabel(u)}
            </option>
          ))
        return (
          <div key={group.sgId} className="lp-manage__editors-group">
            <h3
              id={subjectGradeAnchor(group.sgId)}
              className="lp-manage__editors-head"
              tabIndex={-1}
            >
              {group.sgLabel}
            </h3>

            {/* ⚑ THE SUBJECT ADMINISTRATOR, AND WHAT A SUBJECT ADMIN SEES OF IT (D6a round 3). They
                get the fact — who administers this subject-grade, which is scoped information they
                already effectively hold — rendered READ-ONLY, with no picker and no remove control.
                A guard that refuses the write while the UI still offers the button produces an
                administrator who clicks, sees an error, and concludes the app is broken. */}
            {/* ⚑ ITS OWN CLASS, LISTED ON THE SHARED RULE — not a private copy and not a borrowed
                name. The first version referenced `lp-manage__roles-admin` and never wrote a rule for
                it, so this row rendered as an unstyled pile above the identically-shaped editor row
                that IS a flex row; the E2E asserted the text was VISIBLE, which passes on unstyled
                markup, so nothing caught it. Reusing `__editors-add` instead was worse in a different
                way: two elements sharing one class made `querySelector` ambiguous and broke a sibling
                test that meant the editor row. The rule now names both selectors — see custom.scss. */}
            {/* ⚑ A LABELLED LIST, in the same shape as the editors below it (2026-08-19, operator
                report). Before this the administrator was ONE `<div>` carrying a muted role label, a
                name and an address, sitting directly above an unlabelled `<ul>` of editor rows — so it
                read as a COLUMN HEADER for the list beneath, and the operator who wrote the
                authorization model misread it as exactly that. Two lists, each named, each with its
                own action row, cannot be misread that way.

                The count appears only when there is more than one, because "Subject Administrator (1)"
                reads as a system talking about itself. ≤1 is still the policy — this is the shape the
                DATA can take, which `subjectAdminIds` now reports honestly. */}
            <p className="lp-manage__roles-label">
              {admins.length > 1 ? `${SUBJECT_ADMIN}s (${admins.length})` : SUBJECT_ADMIN}
            </p>
            <ul className="lp-manage__list">
              {admins.length > 0 ? (
                admins.map((a) => (
                  <li key={a.id} className="lp-manage__row lp-manage__row--tight">
                    <span className="lp-manage__who">
                      {a.name}
                      {a.email && <span className="lp-manage__who-email">{a.email}</span>}
                    </span>
                    {canSetSubjectAdmin && (
                      <span className="lp-manage__row-actions">
                        <Button
                          className="lp-btn lp-btn--compact"
                          buttonStyle="error"
                          size="small"
                          disabled={busy}
                          aria-label={`Remove ${personLabel(a)} as ${SUBJECT_ADMIN} of ${group.sgLabel}`}
                          onClick={() => vacateAdmin(group, a)}
                        >
                          Remove
                        </Button>
                      </span>
                    )}
                  </li>
                ))
              ) : (
                <li className="lp-manage__row lp-manage__row--tight">
                  <span className="muted">No administrator.</span>
                </li>
              )}
            </ul>

            {/* The picker keeps `__roles-admin`: that class is the shared action-row LAYOUT (see
                custom.scss), and it stays distinct from `__editors-add` so the two rows remain
                individually addressable — a shared class previously made `querySelector` pick the
                wrong one.

                ⚑ THE WRAPPER IS INSIDE THE CONDITION, not around it. `__roles-admin` is a flex row
                carrying its own `margin-top`, so rendering it unconditionally left a Subject
                Administrator — who gets no picker at all under D6a — with an empty 8px row between
                the two lists. An empty styled container is invisible in review and visible on the
                page, which is the wrong way round. */}
            {canSetSubjectAdmin && appointable.length > 0 && (
              <div className="lp-manage__roles-admin">
                <select
                  className="lp-manage__select"
                  aria-label={`Appoint the ${SUBJECT_ADMIN} of ${group.sgLabel}`}
                  value={adminPicks[group.sgId] ?? ''}
                  disabled={busy}
                  onChange={(e) => setAdminPicks((p) => ({ ...p, [group.sgId]: e.target.value }))}
                >
                  <option value="">{admins.length > 0 ? 'Replace with…' : 'Appoint…'}</option>
                  {optionsFor(appointable)}
                </select>
                <Button
                  className="lp-btn"
                  buttonStyle="secondary"
                  size="small"
                  disabled={busy || !adminPicks[group.sgId]}
                  aria-label={`Appoint the ${SUBJECT_ADMIN} of ${group.sgLabel}`}
                  onClick={() => appointAdmin(group)}
                >
                  {admins.length > 0 ? 'Replace' : 'Appoint'}
                </Button>
              </div>
            )}

            {/* ⚑ LABELLED. This list used to appear with no heading at all, directly beneath the
                administrator's row — which is what made that row read as the list's HEADER, and an
                operator who wrote the authorization model misread it as exactly that (2026-08-19).
                The count is the second half: it says "this is a list" before you parse the rows.

                ⚑ The empty case is NOT handled here. "No one has editing access." already shares the
                Add row below, which was a deliberate call (operator report 2026-08-02: with a full
                curriculum most subject-grades have nobody, so the empty group is the shape that
                decides whether this section is scannable). A second empty state here would stack
                where that decision put them side by side. */}
            <p className="lp-manage__roles-label">
              {editors.length > 0 ? `Editing access (${editors.length})` : 'Editing access'}
            </p>
            {editors.length > 0 && (
              <ul className="lp-manage__list">
                {editors.map((u) => (
                  <li key={u.id} className="lp-manage__row lp-manage__row--tight">
                    {/* Name and address on ONE line, not stacked: this list is scanned, and a second
                        line per row doubles its height for a value that is only a disambiguator. */}
                    <span className="lp-manage__who">
                      {u.name}
                      {u.email && <span className="lp-manage__who-email">{u.email}</span>}
                    </span>
                    {/* ⚑ Per-row accessible name — the visible label is only "Remove", so a screen
                        reader listing this page's buttons would otherwise meet N identical controls
                        with no way to tell whose access is about to be revoked. */}
                    <Button
                      className="lp-btn lp-btn--compact"
                      buttonStyle="error"
                      size="small"
                      disabled={busy}
                      aria-label={`Remove editing access for ${personLabel(u)} in ${group.sgLabel}`}
                      onClick={() => removeEditor(group, u)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* The empty message shares the Add row rather than stacking above it: with a full
                curriculum most subject-grades have nobody, so the empty group is the shape that
                decides whether this section is scannable (operator report 2026-08-02). */}
            {(editors.length === 0 || addable.length > 0) && (
              <div className="lp-manage__editors-add">
                {editors.length === 0 && (
                  <span className="muted lp-manage__editors-none">No one has editing access.</span>
                )}
                {addable.length > 0 && (
                  <>
                    <select
                      className="lp-manage__select"
                      aria-label={`Grant editing access for ${group.sgLabel}`}
                      value={editorPicks[group.sgId] ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        setEditorPicks((p) => ({ ...p, [group.sgId]: e.target.value }))
                      }
                    >
                      <option value="">Grant editing access…</option>
                      {/* `personLabel`: an <option> cannot carry markup, so the string form is the
                          shareable part. This is the control where the mistake actually happens —
                          showing the address only on the rows below arrived one step too late. */}
                      {optionsFor(addable)}
                    </select>
                    <Button
                      className="lp-btn"
                      buttonStyle="primary"
                      size="small"
                      disabled={busy || !editorPicks[group.sgId]}
                      aria-label={`Grant editing access in ${group.sgLabel}`}
                      onClick={() => addEditor(group)}
                    >
                      Add
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
