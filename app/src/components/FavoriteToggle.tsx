'use client'

/**
 * Favorite star (SPEC §10) — toggles a per-user favorite on a lesson PLAN via Payload's default
 * REST (POST /api/favorites / DELETE /api/favorites/:id; `user` is stamped server-side, rows are
 * own-only). Used on the library rows and the lesson page. State-changing → JS-driven POST/DELETE
 * (CSRF-guarded by the SameSite=Lax cookie), like EditActions.
 *
 * The server renders the current favorite id (or null); the toggle updates it optimistically from
 * the response, then `router.refresh()` re-syncs the server-rendered sections (e.g. the library's
 * "My favorites" group).
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FavoriteToggle({
  planId,
  favoriteId: initialFavoriteId,
}: {
  planId: number | string
  /** The caller's favorite row id for this plan, or null when not favorited. */
  favoriteId: number | null
}) {
  const router = useRouter()
  const [favoriteId, setFavoriteId] = useState(initialFavoriteId)
  const [busy, setBusy] = useState(false)
  const isFavorite = favoriteId != null

  const onToggle = async () => {
    setBusy(true)
    try {
      if (isFavorite) {
        const res = await fetch(`/api/favorites/${favoriteId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error()
        setFavoriteId(null)
      } else {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonPlan: planId }),
        })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { doc?: { id?: number } }
        setFavoriteId(body.doc?.id ?? null)
      }
      router.refresh()
    } catch {
      // A failed toggle (e.g. expired session) just leaves the star as-is; nothing to roll back.
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      className={`fav-toggle${isFavorite ? ' is-favorite' : ''}`}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      disabled={busy}
      onClick={onToggle}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  )
}
