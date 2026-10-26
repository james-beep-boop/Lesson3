import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enabled: true,
  admin: true,
  search: vi.fn(),
  loadThread: vi.fn(),
}))
vi.mock('../../src/lib/session', () => ({
  requireUser: async () => ({
    payload: {},
    user: { id: 4, roles: state.admin ? ['siteAdmin'] : [] },
  }),
}))
vi.mock('../../src/lib/discussionPages', () => ({
  requireForum: async () => state.enabled,
  listPageParam: () => 1,
  listTopics: async () => ({ pinned: [], rows: [], page: 1, totalPages: 1 }),
  searchTopics: state.search,
  loadThread: state.loadThread,
}))
vi.mock('../../src/lib/systemFlags', () => ({ schoolNameForRender: async () => null }))
vi.mock('../../src/components/Discussions/ReplyComposer', () => ({
  default: () => <span>Reply composer</span>,
}))
vi.mock('../../src/components/Discussions/MarkThreadRead', () => ({
  default: () => <span>Mark read</span>,
}))
vi.mock('../../src/components/Discussions/ModerationControls', () => ({
  default: () => <span>Moderation controls</span>,
}))

import DiscussionsPage from '../../src/app/(frontend)/discuss/page'
import ThreadPage from '../../src/app/(frontend)/discuss/[id]/page'

beforeEach(() => {
  state.enabled = true
  state.admin = true
  vi.clearAllMocks()
  state.loadThread.mockImplementation(async (_payload, _user, _id, _page, enabled) => ({
    id: 12,
    title: 'Topic',
    pinned: false,
    lastSeq: 0,
    page: 1,
    totalPages: 1,
    lastReadSeq: enabled ? -1 : null,
    opening: {
      id: 12,
      seq: 0,
      authorName: 'Colleague',
      createdAt: '2026-10-11T01:00:00Z',
      body: 'Text',
      reference: null,
    },
    replies: [],
  }))
})

describe('moderation page boundaries', () => {
  it('ignores repeated search parameters without crashing the page', async () => {
    const html = renderToStaticMarkup(
      await DiscussionsPage({ searchParams: Promise.resolve({ q: ['one', 'two'] }) }),
    )
    expect(state.search).not.toHaveBeenCalled()
    expect(html).toContain('Discussions')
  })
  it('ignores search parameters while off and does not invite a first post in the empty state', async () => {
    state.enabled = false
    const html = renderToStaticMarkup(
      await DiscussionsPage({ searchParams: Promise.resolve({ q: 'private search' }) }),
    )
    expect(state.search).not.toHaveBeenCalled()
    expect(html).toContain('Discussions are switched off.')
    expect(html).not.toContain('role="search"')
    expect(html).not.toContain('/discuss/new')
  })

  it('passes the off state to the loader and renders neither a reply composer nor mark-read', async () => {
    state.enabled = false
    const html = renderToStaticMarkup(
      await ThreadPage({
        params: Promise.resolve({ id: '12' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(state.loadThread.mock.calls[0][4]).toBe(false)
    expect(html).toContain('Moderation controls')
    expect(html).not.toContain('Reply composer')
    expect(html).not.toContain('Mark read')
  })

  it('does not offer moderation to a teacher in the ordinary forum', async () => {
    state.admin = false
    const html = renderToStaticMarkup(
      await ThreadPage({
        params: Promise.resolve({ id: '12' }),
        searchParams: Promise.resolve({}),
      }),
    )
    expect(html).toContain('Reply composer')
    expect(html).toContain('Mark read')
    expect(html).not.toContain('Moderation controls')
  })
})
