// @vitest-environment jsdom
/**
 * The Users list must never strand itself on a page past the end (#415 review).
 *
 * With 21 accounts awaiting approval, page 2 holds one. Approving it leaves 20 — one page — and the
 * reload of page 2 returns no rows. Shown as-is, that read "No accounts are waiting for approval" and
 * hid the pagination, while 20 accounts still waited on page 1. The list now moves to the last real
 * page instead. The same applies to deleting the last account on a last page.
 */
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, disabled, onClick, type }: React.ComponentProps<'button'>) => (
    <button type={type ?? 'button'} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  toast: { success: vi.fn(), error: vi.fn() },
  useConfig: () => ({ config: { serverURL: '', routes: { api: '/api', admin: '/admin' } } }),
}))
vi.mock('@/components/Manage/Accordion', () => ({
  usePanelOpen: () => true,
  usePanelJump: () => vi.fn(),
}))

import { pageWithinRange, UsersPanel } from '@/components/Manage/UsersPanel'
import type { UserSearchDocument, UserSearchResponse } from '@/lib/userSearchContract'

const account = (id: number): UserSearchDocument => ({
  id,
  name: `Teacher ${id}`,
  email: `teacher${id}@example.com`,
  type: 'Teacher',
  verified: false,
  signInDisabled: false,
  siteAdmin: false,
  grants: [],
  authoredVersions: 0,
  officialVersions: 0,
  updatedAt: '2026-10-19T00:00:00.000Z',
})

const page = (n: number, ids: number[], totalDocs: number): UserSearchResponse => {
  const totalPages = Math.ceil(totalDocs / 20)
  return {
    docs: ids.map(account),
    hasNextPage: n < totalPages,
    hasPrevPage: n > 1 && totalDocs > 0,
    limit: 20,
    page: n,
    totalDocs,
    totalPages,
  }
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('pageWithinRange', () => {
  it('moves an empty page past the end to the last real page', () => {
    expect(pageWithinRange(page(2, [], 20))).toBe(1)
    expect(pageWithinRange(page(5, [], 41))).toBe(3)
  })

  it('leaves real pages, and an empty list, alone', () => {
    expect(pageWithinRange(page(2, [21], 21))).toBeNull()
    expect(pageWithinRange(page(1, range(1, 20), 20))).toBeNull()
    expect(pageWithinRange(page(1, [], 0))).toBeNull()
  })
})

describe('approving the only account on the last page', () => {
  let pending: number[]

  beforeEach(() => {
    pending = range(1, 21)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = new URL(input, 'http://localhost')
        if (init?.method === 'PATCH') {
          const id = Number(url.pathname.split('/').pop())
          pending = pending.filter((value) => value !== id)
          return Response.json({ doc: { id } })
        }
        const n = Number(url.searchParams.get('page') ?? '1')
        return Response.json(page(n, pending.slice((n - 1) * 20, n * 20), pending.length))
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('returns to the remaining accounts instead of claiming the queue is empty', async () => {
    render(<UsersPanel emailEnabled={false} initialStatus="awaiting" />)
    await screen.findByText('Teacher 1')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Teacher 21')

    fireEvent.click(screen.getByText('Teacher 21'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    // The 20 still waiting are shown again, on what is now the only page.
    await screen.findByText('Teacher 1')
    await waitFor(() => expect(screen.queryByText('Teacher 21')).toBeNull())
    expect(screen.queryByText('No accounts are waiting for approval.')).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Teacher \d+/ })).toHaveLength(20)
  })
})
