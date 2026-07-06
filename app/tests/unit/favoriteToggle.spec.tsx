// @vitest-environment jsdom
/**
 * FavoriteToggle regression (eyeball fix 2026-07-03): the SAME version renders two stars — the
 * "My favorites" row and its catalogue row. When one toggles, the server re-renders (router.refresh)
 * and hands the OTHER instance a fresh `favoriteId` prop; the component must reconcile its local
 * state to that prop, or it keeps a stale (deleted) id and its DELETE 404s ("can't unfavorite").
 * This pins the adjust-state-during-render reconciliation on a persistent instance (rerender, not
 * remount). Component test → jsdom (see the docblock); DB-free, runs in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

// FavoriteToggle calls useRouter().refresh() on toggle; stub it (we only test prop reconciliation).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import FavoriteToggle from '@/components/FavoriteToggle'

afterEach(cleanup)

describe('FavoriteToggle re-syncs to the server favoriteId prop', () => {
  it('reflects a prop change on the same instance (no remount)', () => {
    const { rerender } = render(<FavoriteToggle versionId={1} favoriteId={5} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-pressed')).toBe('true') // favorited (row id 5)

    // Server hands this SAME instance a fresh prop after another star deleted the row.
    rerender(<FavoriteToggle versionId={1} favoriteId={null} />)
    expect(btn.getAttribute('aria-pressed')).toBe('false') // reconciled → unfavorited

    // And back again (a fresh favorite row id).
    rerender(<FavoriteToggle versionId={1} favoriteId={9} />)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })
})
