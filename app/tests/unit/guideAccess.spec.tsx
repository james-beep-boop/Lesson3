// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { User } from '@/payload-types'

const session = vi.hoisted(() => ({ requireUser: vi.fn() }))
vi.mock('@/lib/session', () => ({ requireUser: session.requireUser }))

import UserGuidePage from '@/app/(frontend)/guide/page'

const user = (overrides: Partial<User> = {}): User =>
  ({ id: 1, roles: [], assignments: [], ...overrides }) as User

async function renderGuide(currentUser: User) {
  session.requireUser.mockResolvedValue({ user: currentUser })
  const page = await UserGuidePage({ searchParams: Promise.resolve({}) })
  return render(page)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('role-aware guide content', () => {
  it('renders all five overviews and teacher tasks for a Teacher without admin walkthroughs', async () => {
    await renderGuide(user())

    for (const title of [
      'Teachers',
      'Editing',
      'Subject-grade administrators',
      'Site administrators',
      'Role notes',
    ]) {
      expect(screen.getByRole('button', { name: title })).not.toBeNull()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Teachers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subject-grade administrators' }))
    fireEvent.click(screen.getByRole('button', { name: 'Site administrators' }))
    expect(screen.getByRole('button', { name: 'Find and read a lesson' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Find and read a lesson' }))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open a lesson for editing' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create and verify an account' })).toBeNull()
    expect(
      screen.getByText(/Review lesson changes, manage editing access/),
    ).not.toBeNull()
  })

  it('shows editing and subject-grade administration walkthroughs to a Subject-grade admin', async () => {
    await renderGuide(
      user({ assignments: [{ subjectGrade: 10, role: 'subjectAdmin' }] as User['assignments'] }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subject-grade administrators' }))
    fireEvent.click(screen.getByRole('button', { name: 'Site administrators' }))
    expect(screen.getByRole('button', { name: 'Open a lesson for editing' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Grant or remove editing access' })).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Hand administration to another person' }),
    ).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Create and verify an account' })).toBeNull()
  })

  it('shows Editing to a Teacher with a scoped editing grant, without admin walkthroughs', async () => {
    await renderGuide(
      user({ assignments: [{ subjectGrade: 10, role: 'editor' }] as User['assignments'] }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subject-grade administrators' }))
    expect(screen.getByRole('button', { name: 'Open a lesson for editing' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Grant or remove editing access' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Create and verify an account' })).toBeNull()
  })

  it('shows Site Admin workflows without the Subject Admin self-demotion handover', async () => {
    await renderGuide(user({ roles: ['siteAdmin'] }))

    fireEvent.click(screen.getByRole('button', { name: 'Editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subject-grade administrators' }))
    fireEvent.click(screen.getByRole('button', { name: 'Site administrators' }))
    expect(screen.getByRole('button', { name: 'Open a lesson for editing' })).not.toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Hand administration to another person' }),
    ).toBeNull()
    expect(screen.getByRole('button', { name: 'Manage user roles' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Create and verify an account' })).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Set up the first Site administrator' }),
    ).not.toBeNull()
  })
})
