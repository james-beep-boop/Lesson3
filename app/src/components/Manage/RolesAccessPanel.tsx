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
 * ⚑ AUTHORIZATION IS ENTIRELY SERVER-SIDE and this panel adds none of it. `subjectAdminControl`
 * decides what is DRAWN, never what is permitted. D6a as AMENDED 2026-08-19 is asymmetric:
 * `unassign-subject-admin` asserts Site Admin on the route, `assign-subject-admin` permits an
 * administrator of that subject-grade to hand it over, and `enforceAssignmentScope` enforces the whole
 * rule — including "the successor must already hold editing access here" — on every write path
 * including the generic PATCH that bypasses these routes. The hook is the authority; this file only
 * declines to invite a click the server would refuse.
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
import { PersonIdentity } from './PersonIdentity'

/**
 * ⚑ `subjectAdminControl` IS A PROP, not a field of `access`, and THE HYPOTHETICAL CAME TRUE. The
 * capability first rode inside `RolesAccess`, the return type of `lib/editorGroups.ts` — the projection
 * whose whole docblock is that its role gate, trusted query and client projection must not be
 * separable, and whose privacy predicate is deliberately named rather than reusing a general `isAdmin`
 * so that widening it for a PRESENTATIONAL reason cannot silently widen an email disclosure. The
 * warning written here said the first person wanting "Subject Admins may vacate but not appoint" would
 * end up editing a boolean inside the carve-out function. Four days later the operator asked for the
 * mirror image — appoint but not vacate — and because this is a prop, that change is this file plus
 * one render site, and touches nothing that decides who sees an address.
 *
 * ⚑ THREE STATES WOULD BE TWO BOOLEANS, so it is a union. `canSetSubjectAdmin` became one of
 * `'full'` (a Site Administrator: appoint anyone, vacate anyone) or `'handover'` (an administrator of
 * this subject-grade: hand it to one of its existing editors, and vacate nobody). A pair of booleans
 * would have had a fourth combination meaning nothing, and the render site would have had to keep them
 * consistent — which is where a "may vacate" flag left true by accident would live.
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
  subjectAdminControl,
}: {
  access: RolesAccess
  subjectAdminControl: 'full' | 'handover'
}) {
  const mayVacate = subjectAdminControl === 'full'
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
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set())

  const apiBase = apiBaseFrom(config)
  const { target: jumpTarget, consume: consumeJumpTarget } = useJumpTarget()

  // ⚑ RENDER-TIME ADJUSTMENT, not an effect (react-hooks/set-state-in-effect). When the jump target
  // arrives, open the target group immediately during render — React discards this render and retries
  // with the updated state before committing, so the group is visible by the time the focus effect
  // fires. Same pattern as useOpenPanels.ts, which documents why an effect version is wrong here.
  const [jumpTargetOpened, setJumpTargetOpened] = useState<string | null>(null)
  if (jumpTarget !== null && jumpTarget !== jumpTargetOpened) {
    const jumpGroup = access.groups.find((g) => subjectGradeAnchor(g.sgId) === jumpTarget)
    if (jumpGroup && !openGroups.has(jumpGroup.sgId)) {
      setOpenGroups((prev) => {
        const n = new Set(prev)
        n.add(jumpGroup.sgId)
        return n
      })
    }
    setJumpTargetOpened(jumpTarget)
  } else if (jumpTarget === null && jumpTargetOpened !== null) {
    // Target was consumed — reset so jumping to the same group again re-opens it.
    setJumpTargetOpened(null)
  }

  // ⚑ IDS RESOLVE AGAINST ONE ROSTER (D11a). The groups carry id lists, not people, so this map is
  // what turns them back into names — once, rather than the server sending each user once per
  // subject-grade.
  const byId = useMemo(() => new Map(access.roster.map((u) => [u.id, u])), [access.roster])
  useEffect(() => {
    if (!jumpTarget || !access.groups.some((g) => subjectGradeAnchor(g.sgId) === jumpTarget)) return
    // The URL parser already restricts the target grammar, and the membership check above narrows it
    // to a group this caller actually received. Focus the group toggle button rather than an
    // arbitrary selector supplied by the URL.
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
    // `assignmentAction`, matching `vacateAdmin` below — this call was the file's one hand-written
    // route slug, beside a sibling using the helper for the same endpoint pair.
    void act(
      assignmentAction('assign', 'subjectAdmin'),
      u,
      group,
      `${personLabel(u)} now administers ${group.sgLabel}.`,
    )
    setAdminPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  /**
   * The HANDOVER — the same endpoint as `appointAdmin`, a different dialog, and the reason D6a was
   * amended (operator decision 2026-08-19).
   *
   * ⚑ WHAT DIFFERS IS WHAT THE CLICK COSTS THE PERSON CLICKING. A Site Administrator appointing
   * somebody spends nothing and can undo it. An administrator handing over is demoted to editing
   * access in the same transaction by `autoDemotePriorSubjectAdmins`, loses this panel on the next
   * request, and CANNOT undo it — only a Site Administrator can appoint them back. "Make X the Subject
   * Administrator?" would be a true sentence that omits the only part they cannot reverse, which is why
   * this is a separate dialog rather than the same one behind a different flag.
   */
  const handOverAdmin = (group: RolesAccessGroup, admins: WidgetUser[]) => {
    const u = byId.get(Number(adminPicks[group.sgId]))
    if (!u) return
    // "you included", without naming WHICH incumbent is the viewer: this panel has no viewer id, and
    // in handover mode it does not need one — `buildRolesAccess` rules 1–2 hand a non-Site-Admin only
    // the subject-grades they administer, so the viewer is necessarily one of the holders named here.
    // That invariant is pinned in `tests/int/editorGroupsAccess.int.spec.ts`, not assumed. The plural
    // branch is legacy data: ≤1 is policy (`autoDemotePriorSubjectAdmins`), not a DB constraint.
    const consequence =
      admins.length > 1
        ? `All ${admins.length} current administrators — you included — are demoted to editing access.`
        : 'You are demoted to editing access in the same step.'
    if (
      !window.confirm(
        `Hand administration of ${group.sgLabel} to ${personLabel(u)}? ${consequence} Only a Site Administrator can give it back.`,
      )
    ) {
      return
    }
    void act(
      assignmentAction('assign', 'subjectAdmin'),
      u,
      group,
      // Says what happened to the ACTOR too, because the panel is about to vanish from their page:
      // `router.refresh()` re-renders Manage without Roles & Access, and a toast reading only
      // "X now administers Y" would leave them wondering what else the click removed.
      `${personLabel(u)} now administers ${group.sgLabel}. You have editing access there.`,
    )
    setAdminPicks((p) => ({ ...p, [group.sgId]: '' }))
  }

  /**
   * ⚑ THE CONSEQUENCE DEPENDS ON WHO IS LEFT, and it stopped being constant the moment this block
   * became a LIST (2026-08-19). The sentence was unconditional: "It will have no administrator until
   * you appoint one." Remove one of two holders and that is simply false — and it is the half of the
   * dialog the person is actually deciding on. ≤1 is POLICY, enforced by
   * `autoDemotePriorSubjectAdmins`, not a database constraint, so legacy rows can leave two; this
   * panel renders them rather than hiding one, which is what made the warning reachable and wrong.
   * (CodeRabbit, post-merge review of PR #257.)
   */
  const vacateAdmin = (group: RolesAccessGroup, u: WidgetUser, admins: WidgetUser[]) => {
    const others = admins.filter((a) => a.id !== u.id)
    const consequence =
      others.length === 0
        ? 'It will have no administrator until you appoint one — only Site Administrators can mark its versions Official in the meantime.'
        : `${others.map(personLabel).join(', ')} ${
            others.length > 1 ? 'remain' : 'remains'
          } its ${SUBJECT_ADMIN}${others.length > 1 ? 's' : ''}.`
    if (
      !window.confirm(
        `Remove ${personLabel(u)} as ${SUBJECT_ADMIN} of ${group.sgLabel}? ${consequence}`,
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

  const toggleGroup = (sgId: number) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(sgId)) next.delete(sgId)
      else next.add(sgId)
      return next
    })
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
      // ⚑ MINUS ANYONE WHO ALREADY ADMINISTERS HERE. A person can hold an `editor` AND a `subjectAdmin`
      // row for one subject-grade — `access/index.ts` documents that pair as reachable and D6a is
      // forward-only — so an unfiltered editor list can offer an option the endpoint answers with a
      // 409 "already the Subject Administrator". `free` is already clean (it excludes every holder).
      const promotableEditors = editors.filter((u) => !g.subjectAdminIds.includes(u.id))
      return {
        group: g,
        // A LIST since 2026-08-19: the projection reports every holder, because a second one used to
        // be silently dropped. ≤1 is still the policy, so this is normally one entry — but "normally"
        // is not "always", and the old shape could not say so.
        admins: toPeopleSafe(g.subjectAdminIds),
        editors,
        addable: toPeopleSafe(free),
        appointable: [...toPeopleSafe(free), ...promotableEditors],
        /**
         * ⚑ THE HANDOVER POOL IS THE GROUP'S EXISTING EDITORS, AND ONLY THOSE — the same set
         * `enforceAssignmentScope` will accept, because the amended rule requires the successor to
         * already hold editing access here (operator decision 2026-08-19: narrow the blast radius of a
         * mis-click to people already trusted with this subject-grade's content).
         *
         * ⚑ THIS IS NOT THE SECURITY BOUNDARY and must not be read as one. The hook refuses the write
         * whatever this list contains, and the hook is what a generic PATCH meets. Narrowing the picker
         * is here so the two agree — an administrator offered a name the server will refuse learns
         * only that the app is broken.
         */
        handoverable: promotableEditors,
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
    <div>
      {access.groups.length > 1 && (
        <div className="lp-users__filters">
          <input
            className="lp-admin-list__search"
            type="search"
            aria-label="Search subject grades and people"
            placeholder="Search subject grades or people…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {error && (
        <p className="lp-manage__error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 && <p className="lp-manage__empty">Nothing matches this search.</p>}

      {shown.length > 0 && (
        <ul className="lp-users__list">
          {shown.map(({ group, admins, editors, addable, appointable, handoverable }) => {
            const isOpen = openGroups.has(group.sgId)
            const detailsId = `roles-group-${group.sgId}`
            const adminSummary =
              admins.length === 0
                ? 'No admin'
                : `${admins.length} ${admins.length === 1 ? 'admin' : 'admins'}`
            const editorSummary =
              editors.length === 0
                ? 'no editors'
                : `${editors.length} ${editors.length === 1 ? 'editor' : 'editors'}`
            const optionsFor = (people: WidgetUser[]) =>
              people.map((u) => (
                <option key={u.id} value={u.id}>
                  {personLabel(u)}
                </option>
              ))
            return (
              <li key={group.sgId} className="lp-users__row">
                <button
                  type="button"
                  id={subjectGradeAnchor(group.sgId)}
                  className="lp-users__summary"
                  aria-expanded={isOpen}
                  aria-controls={detailsId}
                  onClick={() => toggleGroup(group.sgId)}
                >
                  <span className="lp-users__summary-main">
                    <span className="lp-users__name">{group.sgLabel}</span>
                    <span className="lp-users__email">
                      {adminSummary} · {editorSummary}
                    </span>
                  </span>
                </button>
                <div id={detailsId} className="lp-manage__group-details" hidden={!isOpen}>
                  <p className="lp-manage__roles-label">
                    {admins.length > 1 ? `${SUBJECT_ADMIN}s (${admins.length})` : SUBJECT_ADMIN}
                  </p>
                  <ul className="lp-manage__list">
                    {admins.length > 0 ? (
                      admins.map((a) => (
                        <li key={a.id} className="lp-manage__row lp-manage__row--tight">
                          <PersonIdentity name={a.name} email={a.email} />
                          {mayVacate && (
                            <span className="lp-manage__row-actions">
                              <Button
                                className="lp-btn lp-btn--compact"
                                buttonStyle="error"
                                size="small"
                                disabled={busy}
                                aria-label={`Remove ${personLabel(a)} as ${SUBJECT_ADMIN} of ${group.sgLabel}`}
                                onClick={() => vacateAdmin(group, a, admins)}
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

                  {subjectAdminControl === 'full' && appointable.length > 0 && (
                    <div className="lp-manage__roles-admin">
                      <select
                        className="lp-manage__select"
                        aria-label={`Appoint the ${SUBJECT_ADMIN} of ${group.sgLabel}`}
                        value={adminPicks[group.sgId] ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          setAdminPicks((p) => ({ ...p, [group.sgId]: e.target.value }))
                        }
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

                  {subjectAdminControl === 'handover' && (
                    <div className="lp-manage__roles-admin">
                      {handoverable.length > 0 ? (
                        <>
                          <select
                            className="lp-manage__select"
                            aria-label={`Hand over administration of ${group.sgLabel}`}
                            value={adminPicks[group.sgId] ?? ''}
                            disabled={busy}
                            onChange={(e) =>
                              setAdminPicks((p) => ({ ...p, [group.sgId]: e.target.value }))
                            }
                          >
                            <option value="">Hand over to…</option>
                            {optionsFor(handoverable)}
                          </select>
                          <Button
                            className="lp-btn"
                            buttonStyle="secondary"
                            size="small"
                            disabled={busy || !adminPicks[group.sgId]}
                            aria-label={`Hand over administration of ${group.sgLabel}`}
                            onClick={() => handOverAdmin(group, admins)}
                          >
                            Hand over
                          </Button>
                        </>
                      ) : (
                        <span className="muted">
                          To hand over administration, first grant someone editing access here.
                        </span>
                      )}
                    </div>
                  )}

                  <p className="lp-manage__roles-label">
                    {editors.length > 0 ? `Editing access (${editors.length})` : 'Editing access'}
                  </p>
                  {editors.length > 0 && (
                    <ul className="lp-manage__list">
                      {editors.map((u) => (
                        <li key={u.id} className="lp-manage__row lp-manage__row--tight">
                          <PersonIdentity name={u.name} email={u.email} />
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

                  {(editors.length === 0 || addable.length > 0) && (
                    <div className="lp-manage__editors-add">
                      {editors.length === 0 && (
                        <span className="muted lp-manage__editors-none">
                          No one has editing access.
                        </span>
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
