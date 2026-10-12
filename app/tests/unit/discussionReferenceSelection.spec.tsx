// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const composer = vi.hoisted(() => ({
  state: { phase: 'editing' as const, message: null },
  locked: false,
  submit: vi.fn(),
  retry: vi.fn(),
}))
vi.mock('../../src/components/Discussions/useComposer', () => ({ useComposer: () => composer }))
import TopicComposer from '../../src/components/Discussions/TopicComposer'
import ReplyComposer from '../../src/components/Discussions/ReplyComposer'

const version = { id: 34, semver: '1.0.1', title: 'Fractions', createdAt: '2026-10-10T00:00:00Z' }

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe.each(['topic', 'reply'] as const)('%s lesson reference selection', (kind) => {
  function openComposer() {
    const view = render(
      kind === 'topic' ? (
        <TopicComposer authorId={1} initialReference={null} />
      ) : (
        <ReplyComposer authorId={1} topicId={12} joinedAtSeq={0} />
      ),
    )
    if (kind === 'topic')
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Help' } })
    fireEvent.change(screen.getByLabelText(kind === 'topic' ? 'Post' : 'Reply'), {
      target: { value: 'Can we improve this lesson?' },
    })
    return {
      form: view.container.querySelector('form')!,
      post: screen.getByRole('button', {
        name: kind === 'topic' ? 'Post' : 'Post reply',
      }),
    }
  }

  async function chooseLesson() {
    fireEvent.change(screen.getByLabelText('Find a lesson by its title'), {
      target: { value: 'Fractions' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Fractions' }))
  }

  it('blocks click and form submission until a version is chosen, even after loading finishes', async () => {
    let resolveVersions!: (response: Response) => void
    const versions = new Promise<Response>((resolve) => {
      resolveVersions = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path.startsWith('/api/lesson-plans?')
          ? Promise.resolve(Response.json({ docs: [{ id: 12, title: 'Fractions' }] }))
          : versions,
      ),
    )
    const { form, post } = openComposer()
    expect((post as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Add lesson reference' }))
    expect((post as HTMLButtonElement).disabled).toBe(true)
    await chooseLesson()
    expect(screen.getByText('Loading versions…')).toBeTruthy()
    fireEvent.click(post)
    fireEvent.submit(form)
    expect(composer.submit).not.toHaveBeenCalled()

    await act(async () => resolveVersions(Response.json({ docs: [version] })))
    expect((post as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(form)
    expect(composer.submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^v1\.0\.1 · / }))
    expect((post as HTMLButtonElement).disabled).toBe(false)
    fireEvent.submit(form)
    expect(composer.submit).toHaveBeenCalledTimes(1)
    expect(composer.submit.mock.calls[0][0].data.refVersion).toBe(34)
  })

  it.each(['failed', 'empty'] as const)(
    'keeps the %s version lookup blocked until explicitly cancelled',
    async (result) => {
      vi.stubGlobal(
        'fetch',
        vi.fn((path: string) =>
          path.startsWith('/api/lesson-plans?')
            ? Promise.resolve(Response.json({ docs: [{ id: 12, title: 'Fractions' }] }))
            : Promise.resolve(
                result === 'failed'
                  ? new Response(null, { status: 503 })
                  : Response.json({ docs: [] }),
              ),
        ),
      )
      const { form, post } = openComposer()
      fireEvent.click(screen.getByRole('button', { name: 'Add lesson reference' }))
      await chooseLesson()
      await screen.findByText(
        result === 'failed'
          ? 'The versions could not be loaded. Try again.'
          : 'There are no versions of this lesson you can open.',
      )
      expect((post as HTMLButtonElement).disabled).toBe(true)
      fireEvent.submit(form)
      expect(composer.submit).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect((post as HTMLButtonElement).disabled).toBe(false))
      fireEvent.submit(form)
      expect(composer.submit).toHaveBeenCalledTimes(1)
      expect(composer.submit.mock.calls[0][0].data).not.toHaveProperty('refVersion')
    },
  )
})
