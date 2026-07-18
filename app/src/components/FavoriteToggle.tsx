'use client'

/**
 * Favorite star (SPEC §10) — toggles a per-user favorite on a lesson-plan VERSION via Payload's
 * default REST (POST /api/favorites / DELETE /api/favorites/:id; `user` is stamped server-side,
 * rows are own-only). Used on the library rows (keyed to the row's Official version) and the
 * lesson page (keyed to the viewed version). State-changing → JS-driven POST/DELETE
 * (CSRF-guarded by the SameSite=Lax cookie), like EditActions.
 *
 * The server renders the current favorite id (or null); the toggle updates it optimistically from
 * the response, then `router.refresh()` re-syncs the server-rendered sections (e.g. the library's
 * "My favorites" group).
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FavoriteToggle({
  versionId,
  favoriteId: initialFavoriteId,
  showLabel = false,
  labelOnMobile = false,
}: {
  versionId: number | string
  /** The caller's favorite row id for this version, or null when not favorited. */
  favoriteId: number | null
  /** Render a text label beside the star (used on the lesson page, where the bare glyph is easy to
   *  miss). Library rows keep just the glyph — space is tight and the column reads as a toggle. */
  showLabel?: boolean
  /** Catalogue rows: keep the bare aligned glyph on desktop, but reveal the label at ≤640px, where a
   *  stacked card has room and a bare icon is most ambiguous on touch. The label text is always in
   *  the DOM and hidden with CSS on desktop, so it never affects the desktop column alignment. */
  labelOnMobile?: boolean
}) {
  const router = useRouter()
  const [favoriteId, setFavoriteId] = useState(initialFavoriteId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-sync to the server's value whenever it changes (router.refresh / navigation re-renders this
  // component with a fresh prop). Without this, a SECOND instance of the star for the same version (the
  // "My favorites" row and the catalogue row both render one) keeps its stale local id after the
  // other instance toggled — so its DELETE targets an already-removed row and 404s ("can't
  // unfavorite"), and its filled/empty state drifts from the server. This is React's sanctioned
  // "adjust state during render when a prop changes" pattern (no effect, applied before paint).
  const [syncedFrom, setSyncedFrom] = useState(initialFavoriteId)
  if (initialFavoriteId !== syncedFrom) {
    setSyncedFrom(initialFavoriteId)
    setFavoriteId(initialFavoriteId)
  }

  const isFavorite = favoriteId != null

  const onToggle = async () => {
    setBusy(true)
    setError(null)
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
          body: JSON.stringify({ version: versionId }),
        })
        if (!res.ok) throw new Error()
        const body = (await res.json()) as { doc?: { id?: number } }
        setFavoriteId(body.doc?.id ?? null)
      }
      router.refresh()
    } catch {
      // Surface the failure instead of looking unresponsive (GPT review 2026-07-17): the star was
      // never optimistically flipped (state changes only after a 2xx), so there is nothing to roll
      // back — just tell the user. The usual cause is an expired session. role="alert" announces it.
      setError('Couldn’t update favorite — you may need to sign in again.')
    }
    setBusy(false)
  }

  const label = isFavorite ? 'Remove from favorites' : 'Add to favorites'
  const withLabel = showLabel || labelOnMobile
  return (
    <>
      <button
        type="button"
        className={`fav-toggle${isFavorite ? ' is-favorite' : ''}${showLabel ? ' fav-toggle--labeled' : ''}${
          labelOnMobile && !showLabel ? ' fav-toggle--label-mobile' : ''
        }`}
        aria-pressed={isFavorite}
        aria-label={label}
        title={label}
        disabled={busy}
        onClick={onToggle}
      >
        <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
        {withLabel && <span className="fav-toggle__label">{isFavorite ? 'Favorited' : 'Favorite'}</span>}
      </button>
      {error && (
        <span role="alert" className="inline-error fav-toggle__error">
          {error}
        </span>
      )}
    </>
  )
}
