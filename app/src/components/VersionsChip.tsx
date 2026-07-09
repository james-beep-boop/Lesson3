'use client'

/**
 * The `[N versions ▾]` chip + floating `VersionsPanel` (version-browser redesign PR ②,
 * DECISIONS 2026-07-06; Editor+-only per the 2026-07-08 teacher-first amendment — the SERVER
 * decides whether to render this at all). One reusable pair for the catalogue row and the
 * lesson page (PR ③).
 *
 * The panel lazy-loads on first open via STANDARD Payload REST (no custom endpoint — collection
 * access gates both reads): the plan's versions (author at depth 1 resolves to the names-only
 * roster projection) and the caller's own favorites on them. One line per version —
 * `semver · author · created · ★` — ordered Official-first then newest→oldest (the shared
 * app-wide order). Clicking a line opens that version; the star toggles the caller's
 * per-version favorite (editors' pins). Escape / click-outside closes. Compare deliberately
 * stays OUT of the panel (a lesson-page button).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import FavoriteToggle from './FavoriteToggle'
import { sortVersionsOfficialFirst } from '@/lib/versionsOrder'

interface PanelVersion {
  id: number
  semver?: string | null
  createdAt?: string | null
  author?: { name?: string | null } | number | null
}

export default function VersionsChip({
  planId,
  officialVersionId,
  versionCount,
  currentVersionId = null,
  panelLabel,
}: {
  planId: number | string
  officialVersionId: number | null
  versionCount: number
  /** Lesson-page only: the version being viewed gets a "current" marker (the catalogue passes none). */
  currentVersionId?: number | null
  /** Accessible name for the dialog, e.g. the lesson's display name. */
  panelLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [versions, setVersions] = useState<PanelVersion[]>([])
  const [favByVersion, setFavByVersion] = useState<Map<number, number>>(new Map())
  const panelRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    try {
      const vRes = await fetch(
        `/api/lesson-bundle-versions?where[lessonPlan][equals]=${planId}&depth=1&pagination=false` +
          `&select[semver]=true&select[createdAt]=true&select[author]=true`,
        { credentials: 'same-origin' },
      )
      if (!vRes.ok) throw new Error(`versions fetch failed (${vRes.status})`)
      const vBody = (await vRes.json()) as { docs?: PanelVersion[] }
      const docs = vBody.docs ?? []

      const ids = docs.map((v) => v.id)
      const fMap = new Map<number, number>()
      if (ids.length > 0) {
        const fRes = await fetch(
          `/api/favorites?where[version][in]=${ids.join(',')}&depth=0&pagination=false`,
          { credentials: 'same-origin' },
        )
        if (fRes.ok) {
          const fBody = (await fRes.json()) as { docs?: { id: number; version: number | { id: number } }[] }
          for (const f of fBody.docs ?? []) {
            const vid = typeof f.version === 'object' ? f.version.id : f.version
            fMap.set(Number(vid), f.id)
          }
        }
      }
      setVersions(sortVersionsOfficialFirst(docs, officialVersionId))
      setFavByVersion(fMap)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [planId, officialVersionId])

  const openPanel = (e: React.MouseEvent) => {
    // The catalogue row is itself a link — the chip must not also open the lesson.
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
    if (state === 'idle' || state === 'error') void load()
  }

  // Escape closes; focus the panel on open so keyboard users land inside the dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    panelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const openVersion = (versionId: number) => {
    setOpen(false)
    router.push(`/lessons/${planId}?version=${versionId}`)
  }

  const authorName = (v: PanelVersion): string =>
    typeof v.author === 'object' && v.author?.name ? v.author.name : '—'

  return (
    <>
      <button type="button" className="versions-chip" onClick={openPanel} aria-haspopup="dialog">
        {versionCount} versions ▾
      </button>
      {open && (
        <div className="vp-overlay" onClick={() => setOpen(false)}>
          <div
            ref={panelRef}
            className="vp-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Versions of ${panelLabel}`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vp-head">
              <span className="vp-title">{panelLabel}</span>
              <button type="button" className="vp-close" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {state === 'loading' && <p className="muted vp-note">Loading versions…</p>}
            {state === 'error' && (
              <p className="inline-error vp-note" role="alert">
                Could not load versions — close and try again.
              </p>
            )}
            {state === 'ready' && (
              <ul className="vp-list">
                {versions.map((v) => {
                  const isOfficial = officialVersionId != null && v.id === officialVersionId
                  const isCurrent = currentVersionId != null && v.id === currentVersionId
                  return (
                    <li key={v.id} className={`vp-line${isCurrent ? ' is-current' : ''}`}>
                      <button type="button" className="vp-line-open" onClick={() => openVersion(v.id)}>
                        <span className="vp-semver">
                          {v.semver ?? `v${v.id}`}
                          {isOfficial && <span className="official-tag"> · Official</span>}
                          {isCurrent && <span className="vp-current-tag"> · viewing</span>}
                        </span>
                        <span className="vp-author">{authorName(v)}</span>
                        <span className="vp-date">
                          {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : ''}
                        </span>
                      </button>
                      <FavoriteToggle versionId={v.id} favoriteId={favByVersion.get(v.id) ?? null} />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
