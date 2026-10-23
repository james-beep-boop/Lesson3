// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@payloadcms/ui', () => ({
  Button: ({ children }: React.ComponentProps<'button'>) => <button>{children}</button>,
  toast: { error: vi.fn(), success: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
}))

import { CandidateList, type CandidateRow } from '@/components/AdminDashboard/CandidateList'

const candidate: CandidateRow = {
  id: 12,
  lessonPlanId: 4,
  officialVersionId: 11,
  label: 'Chemical Bonding',
  semver: '1.0.1',
  sgLabel: 'Chemistry — Grade 10',
  authorName: 'Teacher',
  savedAt: '28 Aug 2026',
  official: 'no',
  canDelete: true,
  canEdit: true,
}

afterEach(cleanup)

describe('candidate-version actions by role', () => {
  it('keeps the named return path for a teacher', () => {
    render(
      <CandidateList
        rows={[candidate]}
        emptyText="No versions"
        showAuthor={false}
        showContinueEditing
        searchLabel="Search my saved versions"
      />,
    )

    expect(screen.getByRole('link', { name: 'Continue editing' })).toBeTruthy()
  })

  it('omits the redundant action for an administrator but keeps the title link', () => {
    render(
      <CandidateList
        rows={[candidate]}
        emptyText="No versions"
        showAuthor
        showContinueEditing={false}
        searchLabel="Search versions to delete"
      />,
    )

    expect(screen.queryByRole('link', { name: 'Continue editing' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chemical Bonding' }).getAttribute('href')).toBe(
      '/admin/collections/lesson-bundle-versions/12?edit=1',
    )
  })

  // ⚑ `officialVersionId: null` IS REACHABLE, and this pins it as a case rather than a defensive
  // check that reads as dead. `officialByPlan` is `Map<number, number | null>`: the producer drops
  // plans absent from the map (`undefined`) but deliberately KEEPS a pointerless plan, whose saved
  // versions are candidates precisely because no Official pointer excludes them — Repair lists those
  // plans. With no baseline there is nothing to compare against, so the button must be absent rather
  // than linking a comparison with a missing `from`.
  it('offers no comparison for a candidate whose plan has no Official version', () => {
    render(
      <CandidateList
        rows={[{ ...candidate, officialVersionId: null }]}
        emptyText="No versions"
        showAuthor
        showContinueEditing={false}
        searchLabel="Search versions to delete"
      />,
    )

    expect(screen.queryByRole('link', { name: /Compare to Official/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chemical Bonding' })).toBeTruthy()
  })

  it('offers the comparison when an Official baseline exists', () => {
    render(
      <CandidateList
        rows={[candidate]}
        emptyText="No versions"
        showAuthor
        showContinueEditing={false}
        searchLabel="Search versions to delete"
      />,
    )

    expect(screen.getByRole('link', { name: /Compare to Official/ }).getAttribute('href')).toBe(
      '/lessons/4/compare?from=11&to=12',
    )
  })
})

// Proposal B (2026-10-22): "My saved versions" mixes rows the caller may act on differently, so every
// action follows the row's own server-made decision (`lib/personalVersions.ts`).
describe('per-row actions in My saved versions', () => {
  const renderMine = (row: CandidateRow) =>
    render(
      <CandidateList
        rows={[row]}
        emptyText="No versions"
        showAuthor={false}
        showContinueEditing
        searchLabel="Search my saved versions"
      />,
    )

  it('an own Official version: says Official, keeps editing, offers no Delete and no Compare', () => {
    renderMine({ ...candidate, official: 'yes', officialVersionId: 12, canDelete: false })
    expect(screen.getByText(/Version 1\.0\.1 · Official/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue editing' }).getAttribute('href')).toBe(
      '/admin/collections/lesson-bundle-versions/12?edit=1',
    )
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Compare to Official/ })).toBeNull()
  })

  it('a version in a subject-grade the caller can no longer edit opens to read, without edit intent', () => {
    renderMine({ ...candidate, canEdit: false, canDelete: false })
    expect(screen.getByRole('link', { name: 'Chemical Bonding' }).getAttribute('href')).toBe(
      '/admin/collections/lesson-bundle-versions/12',
    )
    expect(screen.queryByRole('link', { name: 'Continue editing' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    // Comparing is reading, so it stays.
    expect(screen.getByRole('link', { name: /Compare to Official/ })).toBeTruthy()
  })

  it('an unknown Official state fails closed: no Delete, no Compare, no Official label', () => {
    renderMine({ ...candidate, official: 'unknown', officialVersionId: null, canDelete: false })
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Compare to Official/ })).toBeNull()
    expect(screen.queryByText(/Official$/)).toBeNull()
  })

  it('an ordinary own version offers every action', () => {
    renderMine(candidate)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Continue editing' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Compare to Official/ })).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search my saved versions' })).toBeTruthy()
  })
})
