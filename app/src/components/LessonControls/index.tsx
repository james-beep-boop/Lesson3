'use client'

/**
 * LessonControls — the single edit-view control bar for a lesson-plan version (Stage 2 editing model).
 * One header row (declutter redesign 2026-07-15), the edit lifecycle swapping with the mode so no
 * disabled lifecycle button ever shows:
 *
 *   view mode:  Viewing: <title> [Official] │ [Edit] · [Quick preview ↗] · [Formatted PDF ↗] · [Back to lesson]
 *   edit mode:  Editing: <title> [Official] │ [Save · Cancel] · [Quick preview ↗] · [Formatted PDF ↗] · [Back to lesson]
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
import React, { useEffect, useRef, useState } from 'react'
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
import Modal from '../Modal'
import EditJumpNav from './EditJumpNav'

/** The server's error message from a failed Payload REST response, or a labelled status fallback.
 *  Shared by the Save (save-as-new) and Delete flows so their `!res.ok` branches stay in step. */
async function errorMessage(res: Response, label: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
  return body.errors?.[0]?.message || `${label} failed (${res.status})`
}

export default function LessonControls() {
  const { id, savedDocumentData } = useDocumentInfo()
  const { setDisabled, reset, setModified } = useForm()
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
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node)) setPdfMenuOpen(false)
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

  // Whether THIS version is the plan's Official one — determined up front (one cheap read of the
  // plan's pointer) so Save can offer to delete the source only when it's a deletable candidate.
  const [sourceIsOfficial, setSourceIsOfficial] = useState<boolean | null>(null)

  // Whether the CALLER may edit THIS version at all — the client mirror of the server's own gate,
  // via the SAME helper the access layer uses (`isEditorFor`, scoped per subject-grade), so the bar
  // cannot offer an action the form will refuse. Same single-source discipline as `canDelete` below,
  // which #102 fixed for exactly this class of drift; the server remains the authority.
  //
  // Without it the bar lied: a Biology editor opening a Chemistry plan got an Edit button that
  // swapped in Save/Cancel while every field stayed locked — measured on the Rock 2026-07-28, 23 of
  // 23 sampled fields still disabled after pressing Edit, with Save reading "No changes to save".
  // Not a security hole (field-level access held) but a dead end, which is worse UI than no button.
  const canEdit = isEditorFor(user as User | null, toId((savedDocumentData?.subjectGrade ?? null) as never))
  const canEditStructure = isSubjectAdminFor(
    user as User | null,
    toId((savedDocumentData?.subjectGrade ?? null) as never),
  )

  // `editIntent` is what the user (or `?edit=1`) ASKED for; `editing` is what they actually get.
  // Deriving rather than gating the initial state matters because `savedDocumentData` — and so
  // `canEdit` — can resolve after first render; a one-shot initialiser would latch the wrong answer.
  const editing = editIntent && canEdit

  // Keep the form's locked state in sync with our edit/view mode — the single source of truth for
  // whether fields are editable (starts from the `?edit=1` intent; the Edit/Cancel buttons flip it).
  useEffect(() => {
    setDisabled(!editing)
  }, [editing, setDisabled])

  useEffect(() => {
    const planId = toId((savedDocumentData?.lessonPlan ?? null) as never)
    if (!id || planId == null) return // leave `null` (unknown) → Save won't offer to delete the source
    let cancelled = false
    fetch(`/api/lesson-plans/${planId}?depth=0`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        // Only set a definite value when the plan was actually fetched; on failure leave `null`
        // (unknown) so Save does NOT offer to delete the source on a transient API error.
        if (!cancelled && p) setSourceIsOfficial(String(toId(p.officialVersion)) === String(id))
      })
      .catch(() => {
        /* leave `null` (unknown) — Save won't offer delete-source */
      })
    return () => {
      cancelled = true
    }
  }, [id, savedDocumentData])

  // No id → unsaved/new document; nothing to act on yet.
  if (!id) return null

  // "← Back to lesson" (IA redesign PR ④): the editor is entered from a lesson page (or Manage) and
  // exits back to it, viewing THIS version — the loop that replaces the hidden breadcrumb trail.
  // Cross-root-layout navigation (admin → frontend) via a full page load — a Payload secondary
  // Button rendered as an anchor (el="anchor"), so it sits with the other toolbar buttons.
  const planId = toId((savedDocumentData?.lessonPlan ?? null) as never)
  // Chrome casing only (D5): the shouty stored title softens in the bar; the stored value is
  // untouched (it is generator input).
  const title = typeof savedDocumentData?.title === 'string' ? displayTitle(savedDocumentData.title) : null

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
    setEditIntent(true)
    setMsg(null)
  }

  const onDiscard = () => {
    // Revert the form to the saved document (drop unsaved edits) and re-lock to view mode.
    void reset(savedDocumentData ?? {})
    setEditIntent(false)
    setMsg(null)
  }

  const currentContent = () => reduceFieldsToValues(fields, true)

  const onSave = async () => {
    if (saving) return
    // Decide up front whether to also delete the version being edited — offered only for a deletable
    // (non-Official) candidate the CALLER may delete (`canDelete`, computed above; the server re-gates
    // in save-as-new). Asking before the request lets save-as-new create + delete atomically.
    const deleteSource =
      canDelete &&
      window.confirm('Save your edits as a new version and delete the one you are editing?')
    setSaving(true)
    setMsg(null)
    try {
      const body = new FormData()
      body.set('data', JSON.stringify(currentContent()))
      const res = await fetch(
        `/api/lesson-bundle-versions/${id}/save-as-new${deleteSource ? '?deleteSource=true' : ''}`,
        { method: 'POST', body, credentials: 'same-origin' },
      )
      if (!res.ok) throw new Error(await errorMessage(res, 'Save'))
      const out = (await res.json()) as { adminUrl: string }
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
    if (!window.confirm(`Delete this version${title ? ` (“${title}”)` : ''}? This cannot be undone.`)) {
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

  return (
    // The --editing modifier is the CSS signal for edit mode (role-locked "read-only" label chips in
    // custom.scss key off it — the old signal was the absence of the removed view-mode notice).
    <div className={`lesson-controls-wrap${editing ? ' lesson-controls-wrap--editing' : ''}`}>
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
                zero-risk way. Same `.btn` styling and the same shared tokens as the frontend
                control; the visible label is the single word "Back", with the destination carried in
                `aria-label` (DESIGN-button-system-2026-07-30 §2). */}
            <a
              className="btn"
              href={`/lessons/${planId}?version=${id}`}
              aria-label="Back to lesson"
            >
              <span aria-hidden="true">←</span>Back
            </a>
          </div>
        )}
        <div className="lesson-controls__group lesson-controls__group--output">
          {/* Nothing here for a viewer who cannot edit THIS version (`canEdit`): no Edit button
              rather than one that unlocks nothing. Preview and PDF stay — they are what a Teacher,
              or an Editor looking at another subject-grade, actually came for. */}
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
          <Button
            buttonStyle="secondary"
            size="small"
            onClick={onPreview}
            aria-label="Quick preview, opens in a new tab"
          >
            Quick preview ↗
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
              {pdfBusy ? 'Preparing document…' : 'Formatted PDF ↗'}
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
          <Button buttonStyle="secondary" size="small" onClick={() => setDetailsShown((v) => !v)}>
            {detailsShown ? 'Hide details' : 'Show details'}
          </Button>
          {canEdit && (
            <Button buttonStyle="secondary" size="small" onClick={() => setHelpOpen(true)}>
              Editing help
            </Button>
          )}
          {/* Explicit destructive action (view mode only), replacing the native document-controls
              kebab. Shown only for a version the caller may delete; the server re-gates. */}
          {!editing && canDelete && (
            <Button buttonStyle="error" size="small" onClick={onDelete} disabled={saving}>
              Delete
            </Button>
          )}
        </div>
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
      {/* Pressing Edit below the width threshold explains itself here instead of unlocking the form.
          Reuses the Editing-help modal's admin styling (Payload's admin root does not load the
          frontend `.modal` rules, so `lesson-edit-help` IS the admin modal skin, not a variant). */}
      {tooNarrow && (
        <Modal
          title={EDITING_WIDER_SCREEN_TITLE}
          onClose={() => setTooNarrow(false)}
          className="lesson-edit-help"
        >
          <p>{EDITING_WIDER_SCREEN_BODY}</p>
          <div className="modal__actions">
            <Button buttonStyle="primary" size="small" onClick={() => setTooNarrow(false)}>
              Got it
            </Button>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal title="Editing help" onClose={() => setHelpOpen(false)} className="lesson-edit-help">
          <ul className="lesson-edit-help__list">
            <li>Saving creates a new version. The original does not change.</li>
            <li>Press Enter to start a new paragraph.</li>
            <li>
              Start a line with <code>- </code> to make a bullet.
            </li>
            <li>Bold, italics, and underlining are not supported.</li>
            <li>Quick preview checks your content. Formatted PDF shows the final layout.</li>
            {canEditStructure && <li>To add a lesson, duplicate an existing lesson.</li>}
          </ul>
          <div className="modal__actions">
            <Button buttonStyle="primary" size="small" onClick={() => setHelpOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
