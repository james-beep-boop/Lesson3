'use client'

/**
 * Admin edit affordances on the lesson-plan detail page (Stage 2b, working-copy model). Shown only
 * to Subject/Site Admins for the plan's subject-grade. Both are state-changing POSTs (CSRF-guarded
 * by the SameSite=Lax cookie), so they're JS-driven, not plain links.
 *
 *   - Edit         → open this version in the admin editor with edit intent (`?edit=1`), landing
 *                    unlocked; "Save" writes a new candidate. No fork-on-open — a DB row is only
 *                    created on Save (Stage 2 model).
 *   - Make Official → POST …/make-official → reload so the new Official is reflected.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import Modal from '@/components/Modal'
import {
  editingAvailableAtWidth,
  EDITING_WIDER_SCREEN_BODY,
  EDITING_WIDER_SCREEN_TITLE,
} from '@/lib/editingViewport'

export default function EditActions({
  versionId,
  canMakeOfficial,
  officialVersionId,
}: {
  versionId: number
  canMakeOfficial: boolean
  /** The plan's Official version id as rendered — drives the "is this one already Official?"
   *  display AND the stale-consent anchor for delete-previous. */
  officialVersionId: number | null
}) {
  const isOfficial = officialVersionId != null && versionId === officialVersionId
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'official'>(null)
  const [error, setError] = useState<string | null>(null)
  const [tooNarrow, setTooNarrow] = useState(false)

  // Edit opens the admin editor for THIS version with edit intent (`?edit=1`), so the form lands
  // unlocked — LessonControls honours the param instead of the read-only default. No fork-on-open —
  // Save creates the candidate. (Server access still gates the actual write via save-as-new.)
  // Carry the lesson the reader was on (the jump nav sets `#lesson-<n>`) as `?lesson=<n>` so the
  // editor's in-form jump nav opens at that same lesson.
  //
  // Below the width threshold Edit stays VISIBLE and explains itself instead of navigating. The
  // check runs at PRESS time, not render time: reading `window` during render would break SSR and
  // desync on hydration, and a resize between paint and click would make a render-time answer stale.
  const onEdit = () => {
    if (!editingAvailableAtWidth(window.innerWidth)) {
      setTooNarrow(true)
      return
    }
    const m = /^#lesson-(\d+)$/.exec(window.location.hash)
    const lessonParam = m ? `&lesson=${m[1]}` : ''
    window.location.href = `/admin/collections/lesson-bundle-versions/${versionId}?edit=1${lessonParam}`
  }

  const onMakeOfficial = async () => {
    // Promote always; the prompt only governs whether the previously-Official version is also deleted
    // (atomically, server-side). Cancel keeps it. When deleting, we also send WHICH version the user
    // consented to delete (the Official as this page rendered it) — the server 409s if the pointer
    // moved meanwhile, so a concurrent admin's promotion is never destroyed by stale consent.
    const deletePrevious = window.confirm(
      'Make this the Official version.\n\nAlso delete the previously-Official version? (Cancel keeps it.)',
    )
    setBusy('official')
    setError(null)
    try {
      const expected = deletePrevious
        ? `&expectedPreviousOfficialId=${officialVersionId ?? ''}`
        : ''
      const res = await fetch(
        `/api/lesson-bundle-versions/${versionId}/make-official?deletePrevious=${deletePrevious}${expected}`,
        { method: 'POST', credentials: 'same-origin' },
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] }
        throw new Error(body.errors?.[0]?.message ?? 'Could not mark Official.')
      }
      router.refresh()
      setBusy(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark Official.')
      setBusy(null)
    }
  }

  // A fragment, not a wrapper: the buttons must be DIRECT children
  // of the .export-bar flex row to pick up its gap — a wrapping span left them flush together.
  return (
    <>
      {/* Edit renders at EVERY width. Below the threshold it opens the dialog below rather than
          navigating — honest about why, and discoverable for someone who knows the button from a
          desktop. (Not a repeat of the pre-#155 bug, where Edit appeared to work and silently did
          not: this never claims to enter edit mode.) The editor still self-guards on mount, so a
          hand-typed `?edit=1` lands read-only regardless. Make Official stays at all widths — a
          small confirm-gated action, not content editing. */}
      <button type="button" className="btn lesson-edit" disabled={busy !== null} onClick={onEdit}>
        Edit
      </button>
      {tooNarrow && (
        <Modal title={EDITING_WIDER_SCREEN_TITLE} onClose={() => setTooNarrow(false)}>
          <p className="modal__body">{EDITING_WIDER_SCREEN_BODY}</p>
          <div className="modal__actions">
            <button type="button" className="btn btn--primary" onClick={() => setTooNarrow(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
      {canMakeOfficial && !isOfficial && (
        <button type="button" className="btn" disabled={busy !== null} onClick={onMakeOfficial}>
          {busy === 'official' ? 'Updating…' : 'Make Official'}
        </button>
      )}
      {error && (
        <span role="alert" className="inline-error">
          {error}
        </span>
      )}
    </>
  )
}
