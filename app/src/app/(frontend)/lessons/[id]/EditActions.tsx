'use client'

/**
 * Admin edit affordances on the lesson-plan detail page (Stage 2b, working-copy model). Shown only
 * to Subject/Site Admins for the plan's subject-grade. Both are state-changing POSTs (CSRF-guarded
 * by the SameSite=Lax cookie), so they're JS-driven, not plain links.
 *
 *   - Edit         → POST …/fork → redirect to the new working version's admin editor.
 *   - Make Official → POST …/make-official → reload so the new Official is reflected.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function EditActions({
  versionId,
  isOfficial,
}: {
  versionId: number
  isOfficial: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'edit' | 'official'>(null)
  const [error, setError] = useState<string | null>(null)

  const post = async (action: 'fork' | 'make-official'): Promise<Response> =>
    fetch(`/api/lesson-bundle-versions/${versionId}/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
    })

  const onEdit = async () => {
    setBusy('edit')
    setError(null)
    try {
      const res = await post('fork')
      const body = (await res.json().catch(() => ({}))) as { adminUrl?: string; errors?: { message?: string }[] }
      if (!res.ok || !body.adminUrl) throw new Error(body.errors?.[0]?.message ?? 'Could not start editing.')
      window.location.href = body.adminUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start editing.')
      setBusy(null)
    }
  }

  const onMakeOfficial = async () => {
    setBusy('official')
    setError(null)
    try {
      const res = await post('make-official')
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

  return (
    <span className="edit-actions">
      <button type="button" className="btn" disabled={busy !== null} onClick={onEdit}>
        {busy === 'edit' ? 'Opening…' : 'Edit'}
      </button>
      {!isOfficial && (
        <button type="button" className="btn" disabled={busy !== null} onClick={onMakeOfficial}>
          {busy === 'official' ? 'Updating…' : 'Make Official'}
        </button>
      )}
      {error && (
        <span role="alert" className="muted" style={{ color: '#b00020' }}>
          {error}
        </span>
      )}
    </span>
  )
}
