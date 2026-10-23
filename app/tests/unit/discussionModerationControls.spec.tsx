// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
import ModerationControls from '../../src/components/Discussions/ModerationControls'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// The page's trigger and the dialog's confirm button can share a name ("Redact"), so each lookup is
// scoped to where it lives. (Named, because the Redact dialog's fieldset is a group too.)
const trigger = (name: string) =>
  within(screen.getByRole('group', { name: /moderation$/ })).getByRole('button', {
    name,
  }) as HTMLButtonElement
const confirmButton = (name: string) =>
  within(screen.getByRole('dialog')).getByRole('button', { name }) as HTMLButtonElement

const openTopic = {
  kind: 'topic',
  id: 12,
  pinned: false,
  titleRemoved: false,
  forumEnabled: true,
} as const

describe('moderation controls', () => {
  it('orders a thread’s controls Pin · Delete thread · Redact, and a reply’s as Redact', () => {
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    expect(
      within(screen.getByRole('group', { name: /moderation$/ }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Pin', 'Delete thread', 'Redact'])
    cleanup()
    render(<ModerationControls target={{ kind: 'reply', id: 814 }} bodyRemoved={false} />)
    expect(
      within(screen.getByRole('group', { name: /moderation$/ }))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Redact'])
  })

  it('titles the pin dialog with the whole question and gives it no body', () => {
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Pin'))
    const dialog = screen.getByRole('dialog', { name: 'Pin this discussion' })
    expect(dialog.querySelector('.modal__body')).toBeNull()
    expect(dialog.querySelector('.modal__actions--pair')).toBeTruthy()
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel', 'Pin'])
    cleanup()
    render(<ModerationControls target={{ ...openTopic, pinned: true }} bodyRemoved={false} />)
    fireEvent.click(trigger('Unpin'))
    expect(screen.getByRole('dialog', { name: 'Unpin this discussion' })).toBeTruthy()
    expect(confirmButton('Unpin')).toBeTruthy()
  })

  it('titles the delete dialog with its scope, keeps the warning, and confirms with Delete', () => {
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Delete thread'))
    const dialog = screen.getByRole('dialog', { name: 'Delete entire thread and all replies' })
    expect(within(dialog).getByText('This cannot be undone.')).toBeTruthy()
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Cancel', 'Delete'])
  })

  it('redacts only the selected topic part through the moderation endpoint', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Redact'))
    expect(confirmButton('Redact').disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Title'))
    fireEvent.click(confirmButton('Redact'))
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
    const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/discussion-topics/12/redact')
    expect(request.method).toBe('POST')
    expect(JSON.parse(request.body as string)).toEqual({ title: true })
  })

  it('reply redaction uses its record id, and a lost answer requires reloading rather than another write', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Lost answer')
    })
    vi.stubGlobal('fetch', fetch)
    render(<ModerationControls target={{ kind: 'reply', id: 814 }} bodyRemoved={false} />)
    fireEvent.click(trigger('Redact'))
    fireEvent.click(confirmButton('Redact'))
    await waitFor(() => expect(confirmButton('Reload')).toBeTruthy())
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe('/api/discussion-replies/814/redact')
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Redact' })).toBeNull()
    fireEvent.click(confirmButton('Cancel'))
    expect(trigger('Redact').disabled).toBe(true)
  })

  it('offers neither pin nor already-redacted parts while off, but preserves whole-thread deletion', () => {
    render(
      <ModerationControls
        target={{ kind: 'topic', id: 12, pinned: true, titleRemoved: true, forumEnabled: false }}
        bodyRemoved
      />,
    )
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redact' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete thread' })).toBeTruthy()
  })

  // ⚑ Review of #380 (2026-10-11): a target that changed under the moderator must not leave live
  // controls on a stale page.
  it('a thread already gone (404) returns to the list; an already-redacted post (409) re-renders', async () => {
    const gone = vi.fn(async () =>
      Response.json(
        { errors: [{ message: 'This discussion no longer exists.' }] },
        { status: 404 },
      ),
    )
    vi.stubGlobal('fetch', gone)
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Delete thread'))
    fireEvent.click(confirmButton('Delete'))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/discuss'))
    expect(screen.queryByRole('dialog')).toBeNull()
    cleanup()

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { errors: [{ message: 'Already removed by the administrator.' }] },
          { status: 409 },
        ),
      ),
    )
    render(<ModerationControls target={{ kind: 'reply', id: 814 }} bodyRemoved={false} />)
    fireEvent.click(trigger('Redact'))
    fireEvent.click(confirmButton('Redact'))
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('while a request is pending it cannot be sent twice, and the dialog cannot be dismissed', async () => {
    let answer!: (response: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve
        }),
    )
    vi.stubGlobal('fetch', fetch)
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Delete thread'))
    fireEvent.click(confirmButton('Delete'))
    const working = confirmButton('Working…')
    expect(working.disabled).toBe(true)
    // A disabled button fires nothing, so submit the form directly: the in-flight guard must hold.
    fireEvent.submit(working.closest('form')!)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(confirmButton('Cancel').disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.mouseDown(document.querySelector('.modal-backdrop')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
    answer(Response.json({ ok: true }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/discuss'))
  })

  it('a server error turns the confirmation into Reload, and closing keeps every control locked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ errors: [{ message: 'Something went wrong.' }] }, { status: 500 }),
      ),
    )
    render(<ModerationControls target={openTopic} bodyRemoved={false} />)
    fireEvent.click(trigger('Pin'))
    fireEvent.click(confirmButton('Pin'))
    await waitFor(() => expect(confirmButton('Reload')).toBeTruthy())
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.')
    // A 500 can follow a committed write: after closing, nothing may be retried without a reload.
    fireEvent.click(confirmButton('Cancel'))
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const name of ['Pin', 'Delete thread', 'Redact']) expect(trigger(name).disabled).toBe(true)
    expect(trigger('Reload')).toBeTruthy()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('other refusals keep the dialog and its message so the administrator can act on them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ errors: [{ message: 'Too many requests.' }] }, { status: 429 }),
      ),
    )
    render(<ModerationControls target={{ kind: 'reply', id: 814 }} bodyRemoved={false} />)
    fireEvent.click(trigger('Redact'))
    fireEvent.click(confirmButton('Redact'))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Too many requests.'),
    )
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(router.refresh).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })
})
