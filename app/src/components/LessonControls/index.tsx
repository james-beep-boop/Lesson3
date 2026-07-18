'use client'

/**
 * LessonControls — the single edit-view control bar for a lesson-plan version (Stage 2 editing model).
 * One header row (declutter redesign 2026-07-15), the edit lifecycle swapping with the mode so no
 * disabled lifecycle button ever shows:
 *
 *   view mode:  [← Back to lesson]  Viewing: <title>  [Official chip]  │  [ Edit ]           · Preview
 *   edit mode:  [← Back to lesson]  Editing: <title>  [Official chip]  │  [ Save · Cancel ]  · Preview
 *
 * Read-only by default: the form is locked on mount (`useForm().setDisabled`); "Edit" unlocks it.
 * "Save" writes the current form content as a NEW candidate version (POST …/save-as-new — never moves
 * the Official pointer) and opens it. "Cancel" reverts unsaved changes and re-locks. "Preview" acts
 * on the current form state. The old Download button + kind checkboxes were removed 2026-07-15: they
 * exported the SAVED version — identical to the lesson page's downloads — so the editor keeps only
 * the one output action that needs the live form (Preview). The bold Viewing:/Editing: prefix is the
 * mode signal, replacing the old read-only notice line; Payload's native H1 (the same title) is
 * hidden in custom.scss for this collection.
 *
 * Injected via `admin.components.edit.beforeDocumentControls`; the native Save button and the Edit/API
 * tabs are hidden in custom.scss so this bar is the only control surface.
 */
import React, { useEffect, useState } from 'react'
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

import { isSubjectAdminFor, toId } from '../../access'
import { displayTitle } from '../../lib/displayTitle'
import type { User } from '../../payload-types'
import EditJumpNav from './EditJumpNav'

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
  const [editing, setEditing] = useState<boolean>(() => searchParams.get('edit') === '1')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // The right-hand details sidebar (Lesson Plan / Source Version / Author / Version / timestamps)
  // is useful context but wide; this collapses it on demand (user, 2026-07-17). Deliberately
  // per-page state, ALWAYS shown on open — no persistence, so SSR and first paint agree and
  // there's no hydration branch (the ?edit=1 lesson). The effect drives a body class because this
  // bar renders inside .doc-controls, not as an ancestor of .document-fields; custom.scss turns
  // the class into Payload's own empty-sidebar collapse recipe.
  const [detailsShown, setDetailsShown] = useState(true)
  useEffect(() => {
    document.body.classList.toggle('lp-details-hidden', !detailsShown)
    return () => document.body.classList.remove('lp-details-hidden')
  }, [detailsShown])

  // Whether THIS version is the plan's Official one — determined up front (one cheap read of the
  // plan's pointer) so Save can offer to delete the source only when it's a deletable candidate.
  const [sourceIsOfficial, setSourceIsOfficial] = useState<boolean | null>(null)

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
  // Cross-root-layout navigation (admin → frontend), so a plain <a> like AppNav's links.
  const planId = toId((savedDocumentData?.lessonPlan ?? null) as never)
  // Chrome casing only (D5): the shouty stored title softens in the bar; the stored value is
  // untouched (it is generator input).
  const title = typeof savedDocumentData?.title === 'string' ? displayTitle(savedDocumentData.title) : null

  // The effect above turns `editing` into the form's locked/unlocked state, so these just flip it.
  const onEdit = () => {
    setEditing(true)
    setMsg(null)
  }

  const onDiscard = () => {
    // Revert the form to the saved document (drop unsaved edits) and re-lock to view mode.
    void reset(savedDocumentData ?? {})
    setEditing(false)
    setMsg(null)
  }

  const currentContent = () => reduceFieldsToValues(fields, true)

  const onSave = async () => {
    if (saving) return
    // Decide up front whether to also delete the version being edited — offered only for a deletable
    // (non-Official) candidate the CALLER may delete (admins in scope; an Editor only their own-authored
    // source — mirrors `lessonBundleVersionDelete` and the server-side gate in save-as-new). Asking
    // before the request lets save-as-new create + delete atomically in one handler.
    const canDeleteSource =
      sourceIsOfficial === false &&
      (isSubjectAdminFor(user as User | null, toId((savedDocumentData?.subjectGrade ?? null) as never)) ||
        (user != null && toId((savedDocumentData?.author ?? null) as never) === user.id))
    const deleteSource =
      canDeleteSource &&
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
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        throw new Error(err.errors?.[0]?.message || `Save failed (${res.status})`)
      }
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

  const onPreview = () => {
    // Same-origin hidden-form POST so the endpoint's real HTML (with its CSP) opens in a new tab.
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `/api/lesson-bundle-versions/${id}/preview`
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

  return (
    // The --editing modifier is the CSS signal for edit mode (role-locked "read-only" label chips in
    // custom.scss key off it — the old signal was the absence of the removed view-mode notice).
    <div className={`lesson-controls-wrap${editing ? ' lesson-controls-wrap--editing' : ''}`}>
      {/* One header row (declutter 2026-07-15): exit · what you're looking at · status · divider ·
          lifecycle · output. The lifecycle swaps Edit ⇄ Save/Cancel with the mode (D3/§13: no dead
          lifecycle button ever renders), and the bold Viewing:/Editing: prefix carries the mode. */}
      <div className="lesson-controls">
        <div className="lesson-controls__group">
          {planId != null && (
            <a className="lesson-controls__back" href={`/lessons/${planId}?version=${id}`}>
              ← Back to lesson
            </a>
          )}
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
        <div className="lesson-controls__group lesson-controls__group--output">
          {!editing ? (
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
          <Button buttonStyle="secondary" size="small" onClick={onPreview}>
            Preview
          </Button>
          {/* Toggle for the details sidebar; the changing label carries the state (no aria-pressed
              on top — label-swap and pressed-state together read as contradictory to AT). */}
          <Button buttonStyle="secondary" size="small" onClick={() => setDetailsShown((v) => !v)}>
            {detailsShown ? 'Hide details' : 'Show details'}
          </Button>
        </div>
        {msg ? (
          <span role="alert" className="lesson-controls__msg">
            {msg}
          </span>
        ) : null}
      </div>
      {/* In-form jump nav (2026-07-13): floats with the toolbar (the enclosing .doc-controls is
          already sticky), the edit-page counterpart to the lesson page's .doc-nav. */}
      <EditJumpNav />
    </div>
  )
}
