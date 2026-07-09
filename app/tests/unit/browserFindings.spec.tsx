// @vitest-environment jsdom
/**
 * Pins the 2026-07-09 review-finding fixes on the client browse surfaces:
 *  1. VersionsChip re-fetches on EVERY panel open (favorites toggle INSIDE the panel and never
 *     write back to the chip's map — a first-open snapshot re-mounted stars from stale data).
 *  2. LibraryBrowser search includes PINNED non-Official favorite rows (a query matching only a
 *     pinned favorite used to render "No lesson plans match").
 * Component tests → jsdom, DB-free, run in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

import VersionsChip from '@/components/VersionsChip'
import LibraryBrowser from '@/app/(frontend)/LibraryBrowser'
import type { LessonRow } from '@/lib/substrand'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('VersionsChip refresh-on-open (finding 1)', () => {
  beforeEach(() => {
    const ok = (body: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: RequestInfo | URL) =>
        String(url).includes('/api/favorites')
          ? ok({ docs: [] })
          : ok({ docs: [{ id: 1, semver: '1.0.0', createdAt: '2026-01-01' }] }),
      ),
    )
  })

  it('re-fetches versions AND favorites on every open, not just the first', async () => {
    render(
      <VersionsChip planId={1} officialVersionId={1} versionCount={2} panelLabel="Cells" />,
    )
    const chip = screen.getByRole('button', { name: /2 versions/ })

    fireEvent.click(chip)
    await screen.findByRole('dialog')
    const callsAfterFirstOpen = (fetch as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfterFirstOpen).toBeGreaterThanOrEqual(2) // versions + favorites

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(chip)
    await screen.findByRole('dialog')
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(
      callsAfterFirstOpen + 2, // the reopen fetched BOTH again
    )
  })
})

describe('LibraryBrowser search includes pinned favorites (finding 2)', () => {
  const official: LessonRow = {
    id: 1,
    versionId: 11,
    subjectName: 'Biology',
    grade: 10,
    substrandId: '1.1',
    substrandName: 'Cells',
    strandName: 'Life',
    lessonCount: 3,
  }
  const pinned: LessonRow = {
    id: 2,
    versionId: 22,
    subjectName: 'Biology',
    grade: 10,
    substrandId: '1.2',
    substrandName: 'Animal Nutrition',
    strandName: 'Life',
    lessonCount: 4,
    pinnedSemver: '1.0.2',
    href: '/lessons/2?version=22',
  }

  it('a query matching ONLY a pinned favorite still finds it', () => {
    render(
      <LibraryBrowser
        rows={[official]}
        pinnedRows={[pinned]}
        favPairs={[[22, 7]]}
        initial={{ q: 'nutrition', subject: '', grade: '' }}
      />,
    )
    expect(screen.getByText(/Animal Nutrition/)).toBeTruthy()
    expect(screen.queryByText(/No lesson plans match/)).toBeNull()
  })
})
