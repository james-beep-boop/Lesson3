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

  // Edit opens the admin editor for THIS version with edit intent (`?edit=1`), so the form lands
  // unlocked — LessonControls honours the param instead of the read-only default. No fork-on-open —
  // Save creates the candidate. (Server access still gates the actual write via save-as-new.)
  const onEdit = () => {
    window.location.href = `/admin/collections/lesson-bundle-versions/${versionId}?edit=1`
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

  // A fragment, not a wrapper (same idiom as DownloadButtons): the buttons must be DIRECT children
  // of the .export-bar flex row to pick up its gap — a wrapping span left them flush together.
  return (
    <>
      <button type="button" className="btn" disabled={busy !== null} onClick={onEdit}>
        Edit
      </button>
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
