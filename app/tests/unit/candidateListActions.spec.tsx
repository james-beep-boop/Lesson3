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
      />,
    )

    expect(screen.getByRole('link', { name: 'Continue editing' })).toBeTruthy()
  })

  it('omits the redundant action for a Site Administrator but keeps the title link', () => {
    render(
      <CandidateList
        rows={[candidate]}
        emptyText="No versions"
        showAuthor
        showContinueEditing={false}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Continue editing' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chemical Bonding' }).getAttribute('href')).toBe(
      '/admin/collections/lesson-bundle-versions/12?edit=1',
    )
  })
})
