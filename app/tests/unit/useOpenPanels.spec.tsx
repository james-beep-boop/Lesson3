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
  const panels = useOpenPanels(['users', 'users.access', 'plans'], ['plans'], null)
  return (
    <div data-revision={revision}>
      <button type="button" onClick={() => panels.jumpTo('users.access', 'sg-12')}>
        Jump
      </button>
      <button type="button" onClick={() => panels.consumeJumpTarget('sg-12')}>
        Consume
      </button>
      <output data-testid="access-open">{String(panels.isOpen('users.access'))}</output>
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
    // The jump's id brings its ancestor with it and the whole set is written in RENDER order,
    // so this is `users,users.access,plans` — not the click order, and not just the target.
    expect(destination).toContain('open=users%2Cusers.access%2Cplans')
    expect(destination).toContain('at=sg-12')

    // The push is still in flight. Replacing now would mutate the ORIGINAL entry, so Back could no
    // longer restore `open=plans` and the destination's one-shot `at` would never be consumed.
    //
    // ⚑ A SUPERSET FLUSH, so this negative assertion stays honest whatever the deferral mechanism is.
    // The mirror is deferred by `queueMicrotask` (see the ⚑ in `useOpenPanels.ts` — it is what keeps the
    // Back button working), which a microtask drain alone would reach; a timer drain reaches both. The
    // point is the trap, not the queue: an unflushed "did not write" would pass merely because the
    // write had not had its chance yet — the same vacuous assertion as `aria-expanded=false` on a
    // `[hidden]` control. Flushed, it means what it says: given the opportunity, it declined.
    // (The `queueMicrotask` choice itself is pinned by the test below, which a timer CANNOT satisfy.)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
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
    expect(window.location.search).toContain('open=users%2Cusers.access%2Cplans')

    // Next's patched history API notifies useSearchParams after replaceState. The scrubbed URL must
    // not be mistaken for a second arrival that erases the target before its focus consumer uses it.
    view.rerender(<Probe revision={2} />)
    expect(screen.getByTestId('jump-target').textContent).toBe('sg-12')

    // The focus consumer acknowledges the target only after it finds and focuses the destination.
    // A later rerender must not replay that instruction and steal focus from an active control.
    fireEvent.click(screen.getByRole('button', { name: 'Consume' }))
    expect(screen.getByTestId('jump-target').textContent).toBe('')
    view.rerender(<Probe revision={3} />)
    expect(screen.getByTestId('jump-target').textContent).toBe('')

    // The same target remains reusable: a later deliberate jump carrying a fresh `at` is a new
    // instruction, even though the open-panel set is unchanged.
    fireEvent.click(screen.getByRole('button', { name: 'Jump' }))
    const secondDestination = String(navigation.push.mock.calls[1]![0])
    window.history.pushState(null, '', secondDestination)
    view.rerender(<Probe revision={4} />)
    await waitFor(() => expect(screen.getByTestId('jump-target').textContent).toBe('sg-12'))
    fireEvent.click(screen.getByRole('button', { name: 'Consume' }))
    expect(screen.getByTestId('jump-target').textContent).toBe('')

    // A genuine history arrival has a different semantic location and must still restore its own
    // disclosure state rather than being mistaken for the `at` scrub above.
    window.history.replaceState(null, '', '/admin?open=plans')
    view.rerender(<Probe revision={5} />)
    expect(screen.getByTestId('access-open').textContent).toBe('false')
    expect(screen.getByTestId('jump-target').textContent).toBe('')

    // Even when panel state is otherwise unchanged, a client arrival carrying an unsafe target is
    // scrubbed rather than being left in the address bar for a future focus consumer.
    window.history.pushState(null, '', '/admin?open=plans&at=not%20an%20id')
    view.rerender(<Probe revision={6} />)
    await waitFor(() => expect(window.location.search).not.toContain('at='))
    expect(screen.getByTestId('jump-target').textContent).toBe('')
  })
})

/**
 * ⚑ THE ONE THING THAT PINS `queueMicrotask` RATHER THAN A TIMER, and it exists because the deferral
 * mechanism is not a style choice — it is the whole fix, and it was got wrong twice before it was got
 * right (DECISIONS 2026-08-19):
 *
 *   - No deferral at all: the mount write reaches Next's NATIVE `replaceState` (the router installs its
 *     patch in a PARENT effect, and React flushes a child's effects first), stamping the entry with
 *     `state: null`. Next's `onPopState` opens `if (!event.state) return`, so Back becomes a silent
 *     no-op for the rest of the session.
 *   - `setTimeout(…, 0)`: fixes that, but leaves the address bar a macrotask behind the panels, so a
 *     reload issued immediately after a click loses the open state.
 *
 * Only a microtask satisfies both — after the effect flush, still inside the same task. This test is
 * the fast guard for the second half: it flushes MICROTASKS ONLY, so it passes under `queueMicrotask`
 * and FAILS under any timer. Without it, that distinction lived solely in a comment and in an e2e
 * failure that presents as an unrelated flake.
 */
describe('the URL mirror runs in the same task', () => {
  it('has already written the canonical URL after a microtask-only flush', async () => {
    window.history.replaceState(null, '', '/admin')

    await act(async () => {
      render(<Probe />)
    })
    // Deliberately NOT a timer flush: `await Promise.resolve()` drains microtasks and nothing else.
    await act(async () => {
      await Promise.resolve()
    })

    expect(window.location.search).toBe('?open=plans')
  })
})
