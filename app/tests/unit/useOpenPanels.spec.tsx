// @vitest-environment jsdom

/**
 * `useOpenPanels` navigation ordering.
 *
 * The pure projection tests cannot see the race between React's local-state commit and Next's
 * asynchronous `router.push`: updating `open` before the push arrives lets the mirror effect run
 * against the OLD URL, replacing the history entry the jump is supposed to preserve. This harness
 * leaves `push` in flight until the test explicitly delivers its destination.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOpenPanels } from '../../src/components/Manage/useOpenPanels'

const navigation = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }))

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

function Probe({ revision = 0 }: { revision?: number }) {
  const panels = useOpenPanels(['access', 'plans'], ['plans'], null)
  return (
    <div data-revision={revision}>
      <button type="button" onClick={() => panels.jumpTo('access', 'sg-12')}>
        Jump
      </button>
      <output data-testid="access-open">{String(panels.isOpen('access'))}</output>
      <output data-testid="jump-target">{panels.jumpTarget ?? ''}</output>
    </div>
  )
}

beforeEach(() => {
  navigation.push.mockReset()
  window.history.replaceState(null, '', '/admin?open=plans')
})

afterEach(() => cleanup())

describe('jump navigation', () => {
  it('preserves the current entry until push arrives, then adopts and scrubs the destination', async () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    const view = render(<Probe />)
    replace.mockClear() // Ignore any mount-time canonicalisation; the race starts at the click.

    fireEvent.click(screen.getByRole('button', { name: 'Jump' }))

    expect(navigation.push).toHaveBeenCalledOnce()
    const destination = String(navigation.push.mock.calls[0]![0])
    expect(destination).toContain('open=access%2Cplans')
    expect(destination).toContain('at=sg-12')

    // The push is still in flight. Replacing now would mutate the ORIGINAL entry, so Back could no
    // longer restore `open=plans` and the destination's one-shot `at` would never be consumed.
    await act(async () => Promise.resolve())
    expect(`${window.location.pathname}${window.location.search}`).toBe('/admin?open=plans')
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByTestId('access-open').textContent).toBe('false')

    // Deliver the router navigation. Next's navigation hooks become reactive at this point; rerender
    // models that notification without making the mock pretend `push` was synchronous.
    window.history.pushState(null, '', destination)
    view.rerender(<Probe revision={1} />)

    await waitFor(() => expect(screen.getByTestId('access-open').textContent).toBe('true'))
    expect(screen.getByTestId('jump-target').textContent).toBe('sg-12')
    await waitFor(() => expect(window.location.search).not.toContain('at='))
    expect(window.location.search).toContain('open=access%2Cplans')

    // Next's patched history API notifies useSearchParams after replaceState. The scrubbed URL must
    // not be mistaken for a second arrival that erases the target before its focus consumer uses it.
    view.rerender(<Probe revision={2} />)
    expect(screen.getByTestId('jump-target').textContent).toBe('sg-12')

    // A genuine history arrival has a different semantic location and must still restore its own
    // disclosure state rather than being mistaken for the `at` scrub above.
    window.history.replaceState(null, '', '/admin?open=plans')
    view.rerender(<Probe revision={3} />)
    expect(screen.getByTestId('access-open').textContent).toBe('false')
    expect(screen.getByTestId('jump-target').textContent).toBe('')

    // Even when panel state is otherwise unchanged, a client arrival carrying an unsafe target is
    // scrubbed rather than being left in the address bar for a future focus consumer.
    window.history.pushState(null, '', '/admin?open=plans&at=not%20an%20id')
    view.rerender(<Probe revision={4} />)
    await waitFor(() => expect(window.location.search).not.toContain('at='))
    expect(screen.getByTestId('jump-target').textContent).toBe('')
  })
})
