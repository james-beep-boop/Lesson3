'use client'

/**
 * LessonControls — the single edit-view control bar for a lesson-plan version (Stage 2 editing model).
 * One header row (declutter redesign 2026-07-15), the edit lifecycle swapping with the mode so no
 * disabled lifecycle button ever shows:
 *
 *   view mode:  Viewing: <title> [Official] │ [Edit] · [Quick preview ↗] · [Formatted PDF ↗] · [Back to lesson]
 *   edit mode:  Editing: <title> [Official] │ [Save · Cancel] · [Insert link] · [Quick preview ↗] · [Formatted PDF ↗] · [Back to lesson]
 *
 * Read-only by default: the form is locked on mount (`useForm().setDisabled`); "Edit" unlocks it.
 * "Save" writes the current form content as a NEW candidate version (POST …/save-as-new — never moves
 * the Official pointer) and opens it. "Cancel" reverts unsaved changes and re-locks. "Quick preview"
 * (fast mammoth HTML, structure only) and "Formatted PDF" (the accurate DOCX→PDF rendering — cached
 * export PDF when pristine, generated from the live form when there are unsaved edits) both act on
 * the current form state. The old Download button + kind checkboxes were removed 2026-07-15: they
 * exported the SAVED version — identical to the lesson page's downloads. The bold Viewing:/Editing: prefix is the
 * mode signal, replacing the old read-only notice line; Payload's native H1 (the same title) is
 * hidden in custom.scss for this collection.
 *
 * Injected via `admin.components.edit.beforeDocumentControls`; the native Save button and the Edit/API
 * tabs are hidden in custom.scss so this bar is the only control surface.
 */
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Button,
  useAllFormFields,
  useAuth,
  useDocumentInfo,
  useForm,
  useFormModified,
} from '@payloadcms/ui'
import { reduceFieldsToValues } from 'payload/shared'

import { isEditorFor, isSubjectAdminFor, toId } from '../../access'
import { canDeleteVersionDoc } from '../../access/versioning'
import { displayTitle } from '../../lib/displayTitle'
import {
  editingAvailableAtWidth,
  EDITING_WIDER_SCREEN_BODY,
  EDITING_WIDER_SCREEN_TITLE,
} from '../../lib/editingViewport'
import { DELIVERABLE_LABELS } from '../../generator/deliverables'
import { versionDeliverables } from '../../generator/adapter'
import type { DeliverableTag } from '../../generator/exportArtifacts'
import type { User } from '../../payload-types'
import { openGeneratedPdfInNewTab, openPreparedPdfInNewTab } from '../exportClient'
import { EditRecoveryIndicator } from '../EditRecovery/Indicator'
import { EditRecoveryRestorePrompt } from '../EditRecovery/RestorePrompt'
import { applyCapture, projectCapture } from '../../lib/editRecovery/projection'
import { useEditRecoveryFlushRegistry } from '../EditRecovery/flushRegistry'
import { useEditRecovery } from '../EditRecovery/useEditRecovery'
// The wire contract, not a re-description of it — see the note on `RecoveryToken` in `protocol.ts`.
import type { RecoveryToken } from '../EditRecovery/protocol'
import Modal from '../Modal'
import {
  clearActiveLinkTarget,
  hasActiveLinkTarget,
  openActiveLinkTarget,
  subscribeToActiveLinkTarget,
} from '../LinkedTextarea/activeTarget'
import EditJumpNav from './EditJumpNav'
import { beginEntryPhase, endEntryPhaseOnFirstInput } from './entryPhase'
import { initialCollapseActions } from './initialCollapse'
import CompareToOfficialLink from '../CompareToOfficialLink'

/** The server's error message from a failed Payload REST response, or a labelled status fallback.
 *  Shared by the Save (save-as-new) and Delete flows so their `!res.ok` branches stay in step. */
async function errorMessage(res: Response, label: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
  return body.errors?.[0]?.message || `${label} failed (${res.status})`
}

export default function LessonControls() {
  const { id, savedDocumentData } = useDocumentInfo()
  const { dispatchFields, initializing, setDisabled, reset, setModified } = useForm()
  // Pristine-form Save gate (user decision 2026-07-17, "disabled" variant): an untouched form has
  // nothing to save, so Save is disabled with a tooltip saying why. Payload's `modified` means
  // "touched", not "different" — type a char and delete it and the form counts as modified — so the
  // save-as-new endpoint's identical-content 400 remains the authoritative backstop.
  const modified = useFormModified()
  const [fields] = useAllFormFields()
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Local mirror of edit/view mode — drives our buttons; the effect below drives the form fields.
  // Initial value honours an explicit edit-intent deep link (`?edit=1`, set by the lesson page's
  // Edit button) so a user who clicked "Edit" lands unlocked instead of on a locked form hunting for
  // a second button. Any other entry (e.g. opened to preview) starts read-only.
  // Must come from useSearchParams, NOT window.location: the admin route renders per-request, so
  // the server sees the param too and SSR matches hydration — a window-gated read renders locked
  // HTML on the server and unlocked on the client, a hydration mismatch (React #418) on every
  // ?edit=1 load.
  const [editIntent, setEditIntent] = useState<boolean>(() => searchParams.get('edit') === '1')
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false)
  // Deliverables offered in the open "View as PDF" menu — computed ONCE when the button is pressed
  // (see onViewPdfClick), never on render. Keeps a stale/omitted document out of the menu after an
  // admin's unsaved structural add/remove, without re-scanning the (very tall) form per keystroke.
  const [pdfMenuTags, setPdfMenuTags] = useState<DeliverableTag[]>([])
  const pdfMenuRef = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [tooNarrow, setTooNarrow] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Every visit starts compact, even when Payload has an older per-user "Show All" preference.
  // `initCollapsed` remains the no-flash first-render default; this once-per-document form-state
  // correction is what makes the rule authoritative for returning users. Payload applies its saved
  // row preferences shortly after the base form initializes, so wait for the form state to settle
  // before correcting it; changes during that hydration restart the short timer. It deliberately
  // does NOT rewrite the preference: after this effect runs, Show All / Collapse All and individual
  // row toggles work normally for the rest of the visit.
  // Open this visit's entry phase, which is what lets the PANELS' entry rule tell "the document just
  // opened" from "a jump revealed me". Keyed on `id` alone, so it runs once per mount and once per
  // document change — re-entering the same document later in the session is a new visit and gets a
  // new phase. `entryPhase.ts` carries the reasoning; the row pass below needs no such guard, because
  // form state is complete at entry whether or not a row was ever painted.
  useEffect(() => {
    if (id == null) return
    const documentId = String(id)
    beginEntryPhase(documentId)
    // The reader's first input ends the phase — see `entryPhase.ts` for why a header click has to
    // close it before React handles the click, and why scrolling deliberately does not.
    return endEntryPhaseOnFirstInput(documentId)
  }, [id])

  const collapsedOnEntryFor = useRef<string | null>(null)
  useEffect(() => {
    if (id == null || initializing) return
    const documentId = String(id)
    if (collapsedOnEntryFor.current === documentId) return

    const timer = window.setTimeout(() => {
      const actions = initialCollapseActions(fields)
      if (actions === null) return

      // Mark before dispatch: each action changes `fields` and re-runs this effect.
      collapsedOnEntryFor.current = documentId
      for (const action of actions) dispatchFields(action)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [dispatchFields, fields, id, initializing])

  // The right-hand details sidebar (Lesson Plan / Source Version / Author / Version / timestamps)
  // is useful context but wide; it starts COLLAPSED so the editor opens with the full width for the
  // lesson plan itself (user, 2026-07-17; default inverted 2026-07-28 per
  // docs/DESIGN-editor-usability-2026-07-25.md §4d). Deliberately per-page state, hidden on open —
  // no persistence, so SSR and first paint agree and there's no hydration branch (the ?edit=1
  // lesson). The effect drives a body class because this bar renders inside .doc-controls, not as
  // an ancestor of .document-fields; custom.scss turns the class into Payload's own empty-sidebar
  // collapse recipe.
  //
  // The class marks SHOWN, not hidden: hiding is the CSS default, so the sidebar never paints and
  // then disappears on load the way a state-only default would (the effect runs after first paint).
  const [detailsShown, setDetailsShown] = useState(false)
  useEffect(() => {
    document.body.classList.toggle('lp-details-shown', detailsShown)
    return () => document.body.classList.remove('lp-details-shown')
  }, [detailsShown])

  // Editing is a wider-screen affordance (operator decision 2026-07-28, DECISIONS.md / SPEC §5).
  // At 640px or narrower, drop the `?edit=1` edit intent so a narrow-screen deep link lands in view
  // mode rather than the cramped editor. Two things this deliberately is NOT:
  //   • not a resize handler — it runs ONCE on mount, so an edit session already underway is never
  //     cancelled by a resize (that would discard edits mid-sentence);
  //   • not the lazy initialiser — `window` is undefined during SSR, and reading it on the client's
  //     first render would diverge from the server's `?edit=1` markup (a hydration mismatch).
  // A once-on-mount sync from an external system (the viewport) is exactly what an effect is for, so
  // the set-state-in-effect warning does not apply.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editingAvailableAtWidth(window.innerWidth)) setEditIntent(false)
  }, [])

  // Close the "View as PDF ▾" menu on outside click / Escape (APG disclosure pattern, matching UserMenu).
  useEffect(() => {
    if (!pdfMenuOpen) return
    const onPointer = (e: MouseEvent) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node))
        setPdfMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPdfMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [pdfMenuOpen])

  // The plan's Official pointer, retained rather than reduced to a boolean: besides deciding whether
  // THIS version is a candidate, it selects the exact baseline for Compare to Official. `null` inside
  // the object means the plan is pointerless; an absent/mismatched object means still unknown.
  const [officialPointer, setOfficialPointer] = useState<{
    planId: number
    versionId: number | null
  } | null>(null)

  // Whether the CALLER may edit THIS version at all — the client mirror of the server's own gate,
  // via the SAME helper the access layer uses (`isEditorFor`, scoped per subject-grade), so the bar
  // cannot offer an action the form will refuse. Same single-source discipline as `canDelete` below,
  // which #102 fixed for exactly this class of drift; the server remains the authority.
  //
  // Without it the bar lied: a Biology editor opening a Chemistry plan got an Edit button that
  // swapped in Save/Cancel while every field stayed locked — measured on the Rock 2026-07-28, 23 of
  // 23 sampled fields still disabled after pressing Edit, with Save reading "No changes to save".
  // Not a security hole (field-level access held) but a dead end, which is worse UI than no button.
  const canEdit = isEditorFor(
    user as User | null,
    toId((savedDocumentData?.subjectGrade ?? null) as never),
  )
  const canEditStructure = isSubjectAdminFor(
    user as User | null,
    toId((savedDocumentData?.subjectGrade ?? null) as never),
  )

  // `editIntent` is what the user (or `?edit=1`) ASKED for; `editing` is what they actually get.
  // Deriving rather than gating the initial state matters because `savedDocumentData` — and so
  // `canEdit` — can resolve after first render; a one-shot initialiser would latch the wrong answer.
  const editing = editIntent && canEdit
  const linkTargetReady = useSyncExternalStore(
    subscribeToActiveLinkTarget,
    hasActiveLinkTarget,
    () => false,
  )

  // The live form values, read at call time. Declared here because edit recovery (below) is the
  // first consumer; the save path uses the same function so both send an identical snapshot.
  const currentContent = () => reduceFieldsToValues(fields, true)

  // ── Edit recovery (SPEC §5) ───────────────────────────────────────────────────────────────────
  const { register: registerRecoveryFlush } = useEditRecoveryFlushRegistry()
  const recovery = useEditRecovery({
    versionId: id ?? '',
    // ⚑ `editing`, NOT `editIntent`. It is the ACTUAL unlock: at ≤640px Edit opens the
    // narrow-screen dialog without unlocking, and `?edit=1` is neutralised on load. Starting a
    // session on intent would mint rows for people who cannot type into them and spend their
    // per-user active-capture cap doing it.
    active: Boolean(id) && editing,
    modified,
    // ⚑ `fields` is Payload's form state and its identity changes on EVERY edit, which is what makes
    // the capture debounce restart per keystroke. `modified` cannot do that job — it is a boolean
    // that flips once and then never changes again.
    changeSignal: fields,
    getDocument: currentContent,
    registerFlush: registerRecoveryFlush,
  })

  // Held while we do not yet know what is waiting, and while the user is deciding about it.
  const recoveryGate = recovery.entry.phase === 'resolving' || recovery.entry.phase === 'offer'

  // Keep the form's submit state in sync with our edit/view mode (starts from the `?edit=1` intent;
  // the Edit/Cancel buttons flip it), extended over the recovery entry so a save cannot land while an
  // offer is undecided.
  //
  // ⚑ **`setDisabled` does NOT make fields read-only.** Payload 3.85.1's `useField()` derives its
  // `disabled` from `processing || initializing` alone — verified in installed source — and never
  // consumes `useForm().disabled`. So this gates SUBMISSION, and calling it "locking the form" (as an
  // earlier version of this comment did) describes something the framework does not do.
  //
  // What actually protects an unread capture is therefore NOT this line, and must not be assumed to
  // be: the restore prompt covers the page (asserted in `tests/e2e/editRecoveryRestore.e2e.spec.ts`),
  // and `useEditRecovery` refuses to capture at all while an offer is unresolved — so even a teacher
  // who does type cannot overwrite the work they have not been shown yet.
  useEffect(() => {
    setDisabled(!editing || recoveryGate)
  }, [editing, recoveryGate, setDisabled])
  const [restoring, setRestoring] = useState(false)

  /**
   * Apply the offered capture to the live form.
   *
   * ⚑ `reset(doc)` then `setModified(true)` — browser-verified 2026-08-07, see
   * `docs/DESIGN-working-drafts.md` §5. `reset` hands the whole document to Payload's `getFormState`,
   * which rebuilds every field path server-side; there is deliberately NO client-side key→path
   * mapper, which would make this a second owner of the bundle's structure. `reset` ends with
   * `setModified(false)` internally, hence the explicit re-dirty afterwards: restored work is
   * unsaved work, and a clean form would let the user navigate away and lose it.
   */
  const onRestore = async () => {
    if (recovery.entry.phase !== 'offer' || restoring) return
    // ⚑ Re-checked here, not left to the button's absence. "A stale capture is never applied" is a
    // data-integrity invariant — its row ids may no longer mean what they meant, so applying it can
    // land one lesson's prose on another — and an invariant enforced only by which control renders is
    // one refactor away from being enforced by nothing.
    if (recovery.entry.readOnly) {
      recovery.keepOffer()
      return
    }
    setRestoring(true)
    try {
      const { doc } = applyCapture(currentContent() as never, recovery.entry.capture.content)
      await reset(doc as never)
      setModified(true)
      recovery.keepOffer()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not restore those changes')
      recovery.keepOffer()
    } finally {
      setRestoring(false)
    }
  }

  // Starting is separate from `active` so the hook never fires a request from its own render path;
  // the effect is the one place that says "this session has begun".
  const { start: startRecovery } = recovery
  useEffect(() => {
    if (Boolean(id) && editing) startRecovery()
  }, [id, editing, startRecovery])

  const planId = toId((savedDocumentData?.lessonPlan ?? null) as never)
  const officialVersionId =
    planId != null && officialPointer?.planId === planId ? officialPointer.versionId : undefined
  const sourceIsOfficial =
    officialVersionId === undefined ? null : String(officialVersionId) === String(id)

  useEffect(() => {
    if (!id || planId == null) return // leave the pointer unknown → no delete-source or compare offer
    let cancelled = false
    fetch(`/api/lesson-plans/${planId}?depth=0`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        // Only set a definite value when the plan was actually fetched; on failure leave it unknown
        // so Save does NOT offer to delete the source on a transient API error.
        if (!cancelled && p) {
          setOfficialPointer({ planId, versionId: toId(p.officialVersion) ?? null })
        }
      })
      .catch(() => {
        /* leave unknown — Save won't offer delete-source and Compare won't name a guessed baseline */
      })
    return () => {
      cancelled = true
    }
  }, [id, planId])

  // No id → unsaved/new document; nothing to act on yet.
  // ⚑ ABOVE the early return: hooks must run in the same order every render, and `if (!id) return
  // null` sits just below. Projected once per saved document rather than per render — the restore
  // prompt stays open while the user reads it, and this walks every lesson.
  const savedProse = useMemo(() => projectCapture(savedDocumentData), [savedDocumentData])

  if (!id) return null

  // "← Back to lesson" (IA redesign PR ④): the editor is entered from a lesson page (or Manage) and
  // exits back to it, viewing THIS version — the loop that replaces the hidden breadcrumb trail.
  // Cross-root-layout navigation (admin → frontend) via a full page load — a Payload secondary
  // Button rendered as an anchor (el="anchor"), so it sits with the other toolbar buttons.
  // Chrome casing only (D5): the shouty stored title softens in the bar; the stored value is
  // untouched (it is generator input).
  const title =
    typeof savedDocumentData?.title === 'string' ? displayTitle(savedDocumentData.title) : null

  /**
   * WHICH version this is — `1.2.0`, or null while the doc is still loading.
   *
   * ⚑ THE TITLE DOES NOT IDENTIFY A VERSION. Every version of a plan carries the SAME title, so the
   * bar could say `Viewing: Biology Grade 10: Cell Structure · Not Official` for any of a dozen
   * versions, and the Delete confirmation named that same title — looking as though it told you what
   * you were about to destroy while distinguishing nothing. `semver` is the only thing that does, and
   * it is already in `savedDocumentData` beside the title, so this costs no extra read.
   */
  const semver = typeof savedDocumentData?.semver === 'string' ? savedDocumentData.semver : null
  /** For prose: "version 1.2.0", or "this version" when the semver is not known yet. */
  const versionPhrase = semver ? `version ${semver}` : 'this version'

  // Whether the CALLER may delete THIS version — the per-doc form of the server's deletion scope
  // (`canDeleteVersionDoc` == `deletableVersionsWhere`, single source), gated on it being a candidate
  // (non-Official). The server re-checks (delete access + `enforceOfficialNotDeletable`), so this only
  // decides whether to OFFER the action; `sourceIsOfficial === null` (pointer unknown / still loading)
  // → not offered. Drives both the explicit Delete button (view mode) and the Save "also delete the
  // source" prompt below.
  const canDelete =
    sourceIsOfficial === false &&
    canDeleteVersionDoc(user as User | null, {
      subjectGrade: savedDocumentData?.subjectGrade,
      author: savedDocumentData?.author,
    })

  // The effect above turns `editing` into the form's locked/unlocked state, so these just flip it.
  // Press-time width check (not render-time: reading `window` during render breaks SSR and a resize
  // between paint and click would make the answer stale). Below the threshold Edit explains itself
  // instead of unlocking the form. The once-on-mount guard elsewhere in this file still neutralises
  // a hand-typed `?edit=1`, so this is the second half of one rule, not a duplicate of it.
  const onEdit = () => {
    if (!editingAvailableAtWidth(window.innerWidth)) {
      setTooNarrow(true)
      return
    }
    // Each edit session starts without a target: the toolbar action remains disabled until the
    // teacher deliberately places the cursor in a linkable prose field.
    clearActiveLinkTarget()
    setEditIntent(true)
    setMsg(null)
  }

  const onToggleDetails = () => {
    const next = !detailsShown
    setDetailsShown(next)
    if (!next) return
    // After paint, so the sidebar has been revealed and has a position to scroll to. `nearest` keeps
    // a wide window (where it is already beside the fields) completely still.
    requestAnimationFrame(() => {
      document
        .querySelector('.document-fields__sidebar-wrap')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  const onDiscard = () => {
    // Revert the form to the saved document (drop unsaved edits) and re-lock to view mode.
    void reset(savedDocumentData ?? {})
    clearActiveLinkTarget()
    setEditIntent(false)
    setMsg(null)
  }

  const onSave = async () => {
    if (saving) return
    // Decide up front whether to also delete the version being edited — offered only for a deletable
    // (non-Official) candidate the CALLER may delete (`canDelete`, computed above; the server re-gates
    // in save-as-new). Asking before the request lets save-as-new create + delete atomically.
    const deleteSource =
      canDelete && window.confirm(`Save your edits as a new version and delete ${versionPhrase}?`)
    setSaving(true)
    setMsg(null)
    try {
      // ⚑ Flush BEFORE saving, and let the flush decide whether the save may proceed at all
      // (design §5). The two failure kinds are not alike: a transport failure still saves — the
      // version save is what matters and the capture is only insurance — while a 409 must stop,
      // because some precondition on the capture failed and saving on could retire work this
      // client cannot see. The server does not say WHICH precondition (that would leak whether
      // another session exists), so neither does this.
      const plan = await recovery.prepareForSave()
      if (!plan.proceed) {
        // ⚑ Deliberately NEUTRAL about the cause. The server returns one undifferentiated 409 for
        // several states — a newer capture, a superseded session, a retired row — because saying
        // which would leak whether another session exists. Naming "another tab" here would invent a
        // certainty the response does not carry. PR 2b's GET reconciliation is what earns specifics.
        setMsg(
          'Your unsaved work is out of date. Reload before saving, so newer changes are not lost.',
        )
        setSaving(false)
        return
      }

      const body = new FormData()
      body.set('data', JSON.stringify(currentContent()))
      // Separate multipart fields, never keys in the document: a Site Admin editing the raw document
      // must not be able to persist recovery metadata as lesson content. Absent when the flush was
      // indeterminate, which takes the server's no-token path deliberately.
      if (plan.token) {
        body.set('recoveryGeneration', String(plan.token.generation))
        body.set('recoveryExpectedRevision', String(plan.token.revision))
      }
      const res = await fetch(
        `/api/lesson-bundle-versions/${id}/save-as-new${deleteSource ? '?deleteSource=true' : ''}`,
        { method: 'POST', body, credentials: 'same-origin' },
      )
      if (!res.ok) throw new Error(await errorMessage(res, 'Save'))
      const out = (await res.json()) as { adminUrl: string; recoveryToken?: RecoveryToken }
      // Retirement advances the token one last time; adopt it rather than keeping the pair we sent.
      recovery.adoptToken(out.recoveryToken)
      // Navigate CLIENT-SIDE (router.push), not a full-page load. Payload's LeaveWithoutSaving guard
      // only fires its "Leave site?" browser dialog on a real page unload (`beforeunload`) — a client
      // transition triggers neither that nor its anchor-click interceptor, so no prompt, whatever the
      // form's dirty/validity state. (The earlier setModified + setTimeout approach was unreliable: the
      // beforeunload listener is torn down in a passive effect that need not flush before a deferred
      // window.location assignment, and it stays armed while the form is invalid.) setModified(false)
      // stays as correctness hygiene — the save persisted, so the form is no longer dirty.
      setModified(false)
      router.push(out.adminUrl)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  // Explicit Delete (edit-view cleanup 2026-07-18) — promoted out of the native document-controls
  // kebab into a prominent button (view mode only; the kebab is hidden in custom.scss). Only rendered
  // when `canDelete`, but the server is the authority: DELETE is gated by `lessonBundleVersionDelete`
  // + `enforceOfficialNotDeletable`, so a raced Official/scope change is rejected there. On success we
  // leave the (now-gone) admin doc and return to the lesson, which still shows its Official version.
  const onDelete = async () => {
    if (saving) return
    if (
      !window.confirm(
        // Version FIRST, title second: the title is shared by every version of the plan, so leading
        // with it was the least informative thing the dialog could say.
        `Delete ${versionPhrase}${title ? ` of “${title}”` : ''}? This cannot be undone.`,
      )
    ) {
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/lesson-bundle-versions/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(await errorMessage(res, 'Delete'))
      // Cross-root-layout navigation (admin → frontend), so Next gives the shared Back Link a full
      // page load automatically.
      window.location.assign(planId != null ? `/lessons/${planId}` : '/')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed')
      setSaving(false)
    }
  }

  // Same-origin hidden-form POST of the current form state, opening the endpoint's response (its own
  // CSP intact) in a new tab. Shared by Preview (HTML) and the unsaved "View as PDF" — the only
  // difference is the endpoint path.
  const postCurrentContentToNewTab = (path: string) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/lesson-bundle-versions/${id}/${path}`
    form.target = '_blank'
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'data'
    input.value = JSON.stringify(currentContent())
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    form.remove()
  }

  const onPreview = () => postCurrentContentToNewTab('preview')

  // "View as PDF" — the accurate, formatted rendering (the generator's DOCX through Gotenberg) of the
  // chosen deliverable `tag`, opened inline in a new tab. Two paths by whether the form is dirty:
  //   • pristine → reuse the EXISTING export pipeline (cache + make-official pre-warm) via the shared
  //     openPreparedPdfInNewTab, the same dance as the teacher-facing DocButtons.
  //   • unsaved → POST the current form state to /preview-pdf?doc=<tag>, which generates + converts the
  //     working copy on the fly and returns the PDF inline (same mechanism as onPreview).
  // Preview (HTML) stays the fast structural check; this is the one that shows real formatting.
  const onViewPdf = async (tag: DeliverableTag) => {
    if (pdfBusy) return
    setPdfMenuOpen(false)
    setMsg(null)
    setPdfBusy(true)
    try {
      if (modified) {
        // Unsaved working copy — generate + convert on the fly. `openGeneratedPdfInNewTab` FETCHES
        // (rather than the old fire-and-forget form POST), so `pdfBusy` can be held until the
        // request actually settles. That matters: a 12-lesson conversion measures 5.3–6.9 s on the
        // Rock (11.3 s when queued), so the previous fixed 3 s window re-enabled the button
        // mid-conversion on effectively every preview, inviting the re-click that consumed the
        // second conversion slot and opened a raw JSON 503 in a tab.
        const body = new FormData()
        body.set('data', JSON.stringify(currentContent()))
        await openGeneratedPdfInNewTab(
          `/api/lesson-bundle-versions/${id}/preview-pdf?doc=${tag}`,
          body,
        )
      } else {
        // Pristine — reuse the EXISTING export pipeline (cache + make-official pre-warm), the same
        // dance as the teacher-facing DocButtons.
        await openPreparedPdfInNewTab(
          `/api/lesson-bundle-versions/${id}/export?as=pdf`,
          `/api/lesson-bundle-versions/${id}/export/doc?doc=${tag}&as=pdf`,
        )
      }
    } catch (e) {
      // Inline, in the toolbar's existing role="alert" — NOT a raw JSON body rendered as a new tab,
      // which is what every error on this endpoint used to look like.
      setMsg(e instanceof Error ? e.message : 'Could not open the PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  // The "View as PDF" button press: compute the available deliverables ONCE, now, from the live
  // working copy (so an admin's unsaved add/remove of a Final Explanation / Summary Table is
  // reflected — no stale menu item that would 404, no missing one), then either preview the sole
  // document directly or open the picker. The one full-form scan happens here on click, never on
  // render or per keystroke.
  const onViewPdfClick = () => {
    if (pdfBusy) return
    if (pdfMenuOpen) {
      setPdfMenuOpen(false)
      return
    }
    // `versionDeliverables` always includes the Lesson plan, so a length-1 result has tags[0] defined.
    const tags = versionDeliverables(currentContent() as never)
    if (tags.length <= 1) {
      void onViewPdf(tags[0])
      return
    }
    setPdfMenuTags(tags)
    setMsg(null)
    setPdfMenuOpen(true)
  }

  // CSS signals for mode and role. `--prose-only` is deliberately derived from the SAME permission
  // helpers as the server-side field split: a teacher with editing access may change lesson prose,
  // but only a Subject/Site Administrator may add, remove, duplicate or reorder structural rows.
  // ⚑ Best-effort affordance, not the boundary. `canEdit` can resolve after first render, so there
  // are frames where the marker is absent and the controls are briefly visible; `custom.scss` hides
  // them and `applyEditorFieldSplit` is what actually rejects a structural diff.
  const wrapClass = [
    'lesson-controls-wrap',
    editing && 'lesson-controls-wrap--editing',
    canEdit && !canEditStructure && 'lesson-controls-wrap--prose-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapClass}>
      {/* One header row: what you're looking at · status · lifecycle · previews · help · exit.
          The lifecycle swaps Edit ⇄ Save/Cancel with the mode (D3/§13: no dead lifecycle button
          ever renders), and the bold Viewing:/Editing: prefix carries the mode. */}
      <div className="lesson-controls">
        <div className="lesson-controls__group">
          {title && (
            <span className="lesson-controls__title">
              <strong>{editing ? 'Editing:' : 'Viewing:'}</strong> {title}
            </span>
          )}
          {/* Version status stays explicit next to the lifecycle (Codex #4): editing here Saves a
              NEW version, Not Official until an admin promotes it — a working copy shouldn't read
              as authoritative. Hidden until the plan's pointer is known (leaves `null`). */}
          {/* The version number, in BOTH modes. Deliberately not only next to Delete: the question
              "which version am I looking at / editing / about to save over?" is live the whole time
              the bar is on screen, and Delete is just where getting it wrong is unrecoverable. */}
          {semver && <span className="lesson-controls__semver">v{semver}</span>}
          {sourceIsOfficial != null && (
            <span
              className={`lesson-controls__official lesson-controls__official--${
                sourceIsOfficial ? 'is' : 'not'
              }`}
            >
              {sourceIsOfficial ? 'Official version' : 'Not Official'}
            </span>
          )}
        </div>
        {/* Back rides the title row (top-right), so the action buttons below never crowd it and it
            reads as the page exit — matching the frontend's Back-next-to-title placement. The
            --output group is forced onto its own row in custom.scss. */}
        {planId != null && (
          <div className="lesson-controls__group lesson-controls__group--back">
            {/* Plain <a>, not PageBackLink/next/link: this Back crosses from Payload's admin root to
                the frontend root, which is a full-document navigation either way — so route it the
                zero-risk way. Same styling and the same shared tokens as the frontend control; the
                visible label is the single word "Back", with the destination carried in `aria-label`
                (DESIGN-button-system-2026-07-30 §2).
                ⚑ QUIET + COMPACT AND NO `←`, matching `PageBackLink` (2026-08-29) — see its docblock
                for why weight rather than width was the real complaint, and why an icon-only Back was
                rejected. The classes are the ADMIN spellings: `.btn--quiet`/`.btn--compact` live in
                the frontend stylesheet, which this surface never loads, so using them here would
                resolve to nothing at all. `custom.scss` mirrors both against the same shared tokens,
                exactly as `lp-btn--compact` already mirrored the frontend's. */}
            <a
              className="btn lp-btn--quiet lp-btn--compact"
              href={`/lessons/${planId}?version=${id}`}
              aria-label="Back to lesson"
            >
              Back
            </a>
          </div>
        )}
        <div className="lesson-controls__group lesson-controls__group--output">
          {/* Nothing here for a viewer who cannot edit THIS version (`canEdit`): no Edit button
              rather than one that unlocks nothing. Preview and PDF stay — they are what a Teacher,
              or a teacher with editing access looking at another subject-grade, actually came for. */}
          {!canEdit ? null : !editing ? (
            <Button buttonStyle="primary" size="small" onClick={onEdit}>
              Edit
            </Button>
          ) : (
            <>
              <Button
                buttonStyle="primary"
                size="small"
                onClick={onSave}
                disabled={saving || !modified}
                tooltip={!saving && !modified ? 'No changes to save' : undefined}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button buttonStyle="secondary" size="small" onClick={onDiscard} disabled={saving}>
                Cancel
              </Button>
            </>
          )}
          {editing && (
            <Button
              buttonStyle="secondary"
              size="small"
              onClick={openActiveLinkTarget}
              disabled={!linkTargetReady}
              tooltip={!linkTargetReady ? 'Place the cursor in a prose field first' : undefined}
            >
              Insert link
            </Button>
          )}
          <Button
            buttonStyle="secondary"
            size="small"
            onClick={onPreview}
            aria-label="Quick preview, opens in a new tab"
          >
            Quick preview{' '}
            <span aria-hidden="true" className="lesson-controls__ext">
              ↗
            </span>
          </Button>
          {/* The accurate, formatted rendering (real DOCX→PDF), next to the quick HTML preview.
              Pristine → the cached export PDF; unsaved → generated from the current form state. One
              press computes the available documents (fresh, on click): a single-document plan opens
              straight away; a plan with a Final Explanation / Summary Table opens a picker so you can
              choose whichever you're working on. */}
          <div className="lesson-controls__pdf" ref={pdfMenuRef}>
            <Button
              buttonStyle="secondary"
              size="small"
              onClick={onViewPdfClick}
              disabled={pdfBusy}
              aria-busy={pdfBusy}
              aria-expanded={pdfMenuOpen}
              aria-label="Formatted PDF, opens in a new tab"
            >
              {pdfBusy ? (
                'Preparing document…'
              ) : (
                <>
                  Formatted PDF{' '}
                  <span aria-hidden="true" className="lesson-controls__ext">
                    ↗
                  </span>
                </>
              )}
            </Button>
            {pdfMenuOpen && (
              <div className="lesson-controls__pdf-menu">
                {pdfMenuTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="lesson-controls__pdf-item"
                    onClick={() => onViewPdf(tag)}
                    aria-label={`${DELIVERABLE_LABELS[tag]}, opens formatted PDF in a new tab`}
                  >
                    {DELIVERABLE_LABELS[tag]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Toggle for the details sidebar; the changing label carries the state (no aria-pressed
              on top — label-swap and pressed-state together read as contradictory to AT). */}
          {/* ⚑ SCROLL TO IT. The toggle always worked — it flips the body class that reveals Payload's
              sidebar — but the sidebar only sits BESIDE the fields on a wide window. Narrower, it
              takes the full width and stacks below the entire form, so pressing "Show details" moved
              something a long scroll away and read as a dead button (reported 2026-08-23). Bringing it
              into view is the fix; hiding the button below some width would just remove the three
              provenance fields from the people most likely to be on a small screen. */}
          <Button buttonStyle="secondary" size="small" onClick={onToggleDetails}>
            {detailsShown ? 'Hide details' : 'Show details'}
          </Button>
          {canEdit && (
            <Button buttonStyle="secondary" size="small" onClick={() => setHelpOpen(true)}>
              Help
            </Button>
          )}
          {/* Explicit destructive action (view mode only), replacing the native document-controls
              kebab. Shown only for a version the caller may delete; the server re-gates. */}
          {!editing && canDelete && planId != null && officialVersionId != null && (
            <CompareToOfficialLink
              planId={planId}
              officialVersionId={officialVersionId}
              candidateVersionId={Number(id)}
            />
          )}
          {!editing && canDelete && (
            <Button buttonStyle="error" size="small" onClick={onDelete} disabled={saving}>
              Delete
            </Button>
          )}
        </div>
        {/* ⚑ A SIBLING OF THE BUTTON GROUP, NOT A MEMBER OF IT. It used to sit inside
            `--output`, beside Save — "where someone deciding whether their work is safe is already
            looking", which was the right instinct and the wrong container: that group is
            `flex-wrap: nowrap`, so this had no width of its own to defend and no `min-width`, and at
            intermediate widths it collapsed to ONE WORD PER LINE between Cancel and Insert link
            (reported 2026-08-23). `.lesson-controls` DOES wrap, and already hosts the bar's other
            status text below the buttons, so here it is a line under the row — still on screen the
            whole time the caller is editing, which is the part that matters. */}
        {editing && canEdit && <EditRecoveryIndicator status={recovery.status} />}
        {pdfBusy && (
          <span role="status" className="lesson-controls__status">
            This opens in a new tab. Close that tab to return to your edits.
          </span>
        )}
        {msg ? (
          <span role="alert" className="lesson-controls__msg">
            {msg}
          </span>
        ) : null}
      </div>
      {/* In-form jump nav (2026-07-13): floats with the toolbar (the enclosing .doc-controls is
          already sticky), the edit-page counterpart to the lesson page's .doc-nav. */}
      <EditJumpNav />
      {/* The restore offer. Rendered only in the `offer` phase, which is also the phase that keeps
          the form locked — so the panel is never behind a form the user can already type into. */}
      {recovery.entry.phase === 'offer' && (
        <EditRecoveryRestorePrompt
          capture={recovery.entry.capture}
          // Sampled by the hook when the offer opened — resolved against the LIVE form, so a heading
          // says "Lesson 2" only when it really is the teacher's Lesson 2 (the capture's own keys are
          // row UUIDs in JSONB order and cannot). Read rather than recomputed: deriving it here meant
          // rebuilding the whole document on every render for as long as the prompt was open.
          anchors={recovery.entry.anchors}
          // The SAVED prose, so the panel lists only what differs. Projected from
          // `savedDocumentData` — the stored document, deliberately not the live form, whose values
          // are what the capture would be restored OVER.
          saved={savedProse}
          readOnly={recovery.entry.readOnly}
          busy={restoring}
          onRestore={onRestore}
          onKeep={recovery.keepOffer}
          onDiscard={recovery.discardOffer}
        />
      )}
      {/* Pressing Edit below the width threshold explains itself here instead of unlocking the form.
          Reuses the Editing-help modal's admin styling (Payload's admin root does not load the
          frontend `.modal` rules, so `lesson-edit-help` IS the admin modal skin, not a variant). */}
      {tooNarrow && (
        <Modal
          title={EDITING_WIDER_SCREEN_TITLE}
          onClose={() => setTooNarrow(false)}
          className="lesson-edit-help modal--plain"
        >
          <p>{EDITING_WIDER_SCREEN_BODY}</p>
          <div className="modal__actions">
            <Button buttonStyle="secondary" size="small" onClick={() => setTooNarrow(false)}>
              Got it
            </Button>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal title="Help" onClose={() => setHelpOpen(false)} className="lesson-edit-help">
          <p className="modal__body">How editing and saving behave.</p>
          {/* ⚑ ROWS, NOT BULLETS (operator decision 2026-08-23). Eight bullets of mixed importance
              read as one undifferentiated wall: the rule you need and the aside you do not look
              alike. Each is now a claim you can scan plus the detail underneath, which is also what
              gives the quiet rules something to separate — a rule between plain bullets is a line
              between sentences.
              A description list because that is what this is: term, then description. `<div>`
              wrappers around `dt`/`dd` are valid inside `<dl>` and are what let each pair be one
              bordered row. */}
          <dl className="help-rows">
            <div className="help-rows__row">
              <dt>Saving creates a new version</dt>
              <dd>The original does not change.</dd>
            </div>
            <div className="help-rows__row">
              <dt>Press Enter for a new paragraph</dt>
              <dd>
                Start a line with <code>- </code> to make a bullet.
              </dd>
            </div>
            <div className="help-rows__row">
              <dt>Formatting is plain text</dt>
              <dd>Bold, italics, and underlining are not supported.</dd>
            </div>
            <div className="help-rows__row">
              <dt>Insert link adds an address or a PDF</dt>
              <dd>
                Place the cursor in a prose field, then use <em>Insert link</em> in the toolbar to
                add an internet address or a PDF from the Rock.
              </dd>
            </div>
            <div className="help-rows__row">
              <dt>Check your work before saving</dt>
              <dd>Quick preview checks your content. Formatted PDF shows the final layout.</dd>
            </div>
            {canEditStructure && (
              <div className="help-rows__row">
                <dt>Add a lesson by duplicating one</dt>
                <dd>Duplicate an existing lesson, then edit the copy.</dd>
              </div>
            )}
            {/* Moved out of the recovery indicator, which now shows only LIVE status: this is a
                static rule about the feature, so it belongs with the other rules. Still admins
                only — a teacher with editing access cannot make the edits it excludes, and design
                §3 says an administrator who assumed otherwise is the one person the feature would
                actively mislead. */}
            {canEditStructure && (
              <div className="help-rows__row">
                <dt>Only prose is backed up while you type</dt>
                <dd>Structural changes and answer keys are not.</dd>
              </div>
            )}
          </dl>
          {/* ⚑ SECONDARY, not primary. Nothing in this dialog is a primary action — it is an
              acknowledgement, and a filled button claimed an emphasis it has not earned. Manage uses
              outline for both of its row controls, so outline is the house style for a dialog's own
              dismissal. Same for "Got it" below. */}
          <div className="modal__actions">
            <Button buttonStyle="secondary" size="small" onClick={() => setHelpOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
