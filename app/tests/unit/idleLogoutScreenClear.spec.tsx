// @vitest-environment jsdom

/**
 * `IdleLogout` — the SCREEN CLEAR at the session deadline, and the condition on it.
 *
 * ⚑ This pins a work-destroying invariant, which is why it exists rather than being left to review
 * (CLAUDE.md, working process). Clearing the screen is the right outcome on the shared school
 * machines this deployment targets (SPEC §13) — but only when the unsaved work is provably stored.
 * Get the condition backwards and this component becomes the thing that destroys the work edit
 * recovery was built to protect, and it does so silently, in an unattended tab, minutes after the
 * teacher walked away. Nothing else in the system would report it.
 *
 * The whole surface is therefore two assertions and their inverse: safe ⇒ navigate, anything
 * unproven ⇒ log out and LEAVE THE WORK ON SCREEN.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  tokenExpirationMs: 0,
  logOut: vi.fn(async () => true),
}))

vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({
    user: { id: 1, collection: 'users' },
    tokenExpirationMs: mocks.tokenExpirationMs,
    logOut: mocks.logOut,
  }),
}))

import IdleLogout from '../../src/components/IdleLogout/index.js'
import { useEditRecoveryFlushRegistry } from '../../src/components/EditRecovery/flushRegistry.js'

const CHECK_INTERVAL_MS = 30_000
const FLUSH_LEAD_MS = 90_000

let replace: ReturnType<typeof vi.fn>

type Verdict = boolean | 'reject' | 'hang'

/**
 * An editor mounted inside the provider, registering a flush and a safety probe.
 *
 * Registered through the real `useEditRecoveryFlushRegistry`, not by reaching into the registry —
 * the hand-off between the two components is half of what this file is checking, and a test that
 * bypassed it would keep passing if the provider stopped being wired up at all.
 *
 * ⚑ `flush` and `safe` are SEPARATE inputs on purpose. The defect this file now pins is precisely
 * the case where they disagree: a flush that succeeded, followed by a keystroke, so the stored
 * verdict says "safe" while the editor itself knows better.
 */
function FakeEditor({
  flush = true,
  safe,
  onFlush,
}: {
  flush?: Verdict | Verdict[]
  /** The probe's answer. Defaults to agreeing with a plain boolean flush verdict. */
  safe?: boolean | (() => boolean)
  onFlush?: () => void
}) {
  const { register } = useEditRecoveryFlushRegistry()
  const nth = React.useRef(0)
  React.useEffect(() => {
    nth.current = 0
    return register({
      flush: async () => {
        onFlush?.()
        // An array is a per-tick script: the flush window contains several polls, and some cases need
        // the LAST one to behave differently from the ones before it.
        const seq = Array.isArray(flush) ? flush : [flush]
        const v = seq[Math.min(nth.current++, seq.length - 1)]
        if (v === 'reject') throw new Error('flush blew up')
        if (v === 'hang') return new Promise<boolean>(() => {})
        return v
      },
      isSafe: () => {
        if (typeof safe === 'function') return safe()
        if (typeof safe === 'boolean') return safe
        return flush === true
      },
    })
  }, [register, flush, safe, onFlush])
  return null
}

const settle = () =>
  act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })

/**
 * Mount inside the flush window, then step to the deadline one poll at a time.
 *
 * Stepped, with microtasks settled between ticks, rather than one big `advanceTimersByTime`: real
 * ticks are 30 seconds apart and a real flush takes milliseconds, and firing every intervening tick
 * back-to-back with no chance for a promise to resolve reproduces neither.
 */
async function runToDeadline(children?: React.ReactNode) {
  mocks.tokenExpirationMs = Date.now() + FLUSH_LEAD_MS - 1_000
  render(<IdleLogout>{children}</IdleLogout>)
  await settle() // the immediate on-mount check, already inside the window

  for (let elapsed = 0; elapsed <= FLUSH_LEAD_MS; elapsed += CHECK_INTERVAL_MS) {
    await act(async () => {
      vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    })
    await settle()
    if (mocks.logOut.mock.calls.length > 0) break
  }
  await settle()
}

beforeEach(() => {
  mocks.logOut.mockClear()
  replace = vi.fn()
  // jsdom's `location` is not writable; redefine just the method under test.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, pathname: '/admin/collections/lesson-bundle-versions/7', replace },
  })
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the screen clears only when the work is provably stored', () => {
  it('navigates away when every editor reports SAFE', async () => {
    await runToDeadline(<FakeEditor flush={true} />)

    expect(mocks.logOut).toHaveBeenCalledTimes(1)
    expect(replace, 'a confirmed capture earns the screen clear').toHaveBeenCalledTimes(1)
    // The return path matters: signing back in must land on the document, not the admin root.
    expect(replace.mock.calls[0][0]).toBe(
      '/admin/logout-inactivity?redirect=%2Fadmin%2Fcollections%2Flesson-bundle-versions%2F7',
    )
  })

  /**
   * ⚑ THE ASSERTION THIS FILE EXISTS FOR. A refused capture (429, 409, dropped connection) means the
   * only copy of that teacher's work is the text on screen. Logging out is still correct — the token
   * is dead either way — but wiping the screen would delete the last copy.
   */
  it('leaves the editor on screen when an editor reports UNSAFE', async () => {
    await runToDeadline(<FakeEditor flush={false} />)

    expect(mocks.logOut, 'the session must still end').toHaveBeenCalledTimes(1)
    expect(replace, 'the last copy of the work must not be wiped').not.toHaveBeenCalled()
  })

  it('treats a THROWN probe as unsafe', async () => {
    await runToDeadline(
      <FakeEditor
        flush="reject"
        safe={() => {
          throw new Error('probe blew up')
        }}
      />,
    )

    expect(replace).not.toHaveBeenCalled()
  })

  /**
   * ⚑ **THE STALE-VERDICT DEFECT.** Every flush in the window SUCCEEDS, and then the teacher types two
   * seconds before the deadline — inside the 8-second capture debounce, which cannot possibly finish.
   * A remembered `runAll` result says "safe" and would clear the screen over text that was never sent.
   * Asking the editor at the deadline gets the true answer, because only the editor knows the content
   * changed after the last confirmed capture.
   */
  it('does not trust a SUCCESSFUL flush once the content has changed since', async () => {
    await runToDeadline(<FakeEditor flush={true} safe={false} />)

    expect(mocks.logOut, 'the session must still end').toHaveBeenCalledTimes(1)
    expect(
      replace,
      'a verdict from before the last keystroke must not clear the screen',
    ).not.toHaveBeenCalled()
  })

  /**
   * The mirror image: a flush that FAILED, or never resolved, does not condemn work that the editor
   * knows is stored — the safety question is about content, not about the last request's fate.
   */
  it('clears the screen when the probe says safe despite a failed flush', async () => {
    await runToDeadline(<FakeEditor flush="hang" safe={true} />)

    expect(replace).toHaveBeenCalledTimes(1)
  })

  /**
   * ⚑ Two editors, one safe and one not — the whole point of `runAll` returning a conjunction. An
   * `Array.some` here would clear the screen on the strength of the editor that had nothing to lose.
   */
  it('requires EVERY editor to be safe, not just one', async () => {
    await runToDeadline(
      <>
        <FakeEditor flush={true} />
        <FakeEditor flush={false} />
      </>,
    )

    expect(replace).not.toHaveBeenCalled()
  })

  /**
   * ⚑ OVERLAPPING FLUSHES. The interval, `focus` and `visibilitychange` can all reach `runAll` inside
   * the window. Concurrent runs would have each editor capturing against a token another run had just
   * advanced — self-inflicted 409s from the mechanism meant to protect the work. A run in progress is
   * joined, not duplicated.
   */
  it('does not start a second flush while one is running', async () => {
    let started = 0
    let release: (v: boolean) => void = () => {}
    const gate = new Promise<boolean>((r) => {
      release = r
    })

    mocks.tokenExpirationMs = Date.now() + FLUSH_LEAD_MS - 1_000
    render(
      <IdleLogout>
        <FakeEditor
          flush={'hang'}
          safe={true}
          onFlush={() => {
            started += 1
          }}
        />
      </IdleLogout>,
    )
    await settle()

    // Three triggers, all inside the window, before anything can resolve.
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await act(async () => {
      vi.advanceTimersByTime(CHECK_INTERVAL_MS)
    })
    await settle()

    expect(started, 'concurrent triggers must join the run in progress').toBe(1)
    release(true)
  })

  /**
   * No editor mounted — an admin idling on a list view. Vacuously safe: there is no unsaved work, so
   * clearing is pure benefit and the shared-machine case is the only one left.
   */
  it('clears the screen when no editor is mounted at all', async () => {
    await runToDeadline()

    expect(replace).toHaveBeenCalledTimes(1)
  })
})
