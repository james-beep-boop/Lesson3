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
 * An editor mounted inside the provider, registering a flush with a scripted verdict.
 *
 * Registered through the real `useEditRecoveryFlushRegistry`, not by reaching into the registry —
 * the hand-off between the two components is half of what this file is checking, and a test that
 * bypassed it would keep passing if the provider stopped being wired up at all.
 */
function FakeEditor({ verdict }: { verdict: Verdict | Verdict[] }) {
  const { register } = useEditRecoveryFlushRegistry()
  const nth = React.useRef(0)
  React.useEffect(() => {
    nth.current = 0
    return register(async () => {
      // An array is a per-tick script: the flush window contains several polls, and some cases need
      // the LAST one to behave differently from the ones before it.
      const seq = Array.isArray(verdict) ? verdict : [verdict]
      const v = seq[Math.min(nth.current++, seq.length - 1)]
      if (v === 'reject') throw new Error('flush blew up')
      if (v === 'hang') return new Promise<boolean>(() => {})
      return v
    })
  }, [register, verdict])
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
 * ⚑ Stepped, with microtasks settled between ticks, rather than one big `advanceTimersByTime`. The
 * component treats a flush still IN FLIGHT as unproven, and a single jump fires every intervening
 * tick back-to-back with no chance for any flush promise to resolve — so every case would come out
 * "unsafe" and the two positive assertions here would be vacuous. Real ticks are 30 seconds apart
 * and a real flush takes milliseconds; this reproduces that ordering rather than defeating it.
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
  it('navigates away when every flush reported SAFE', async () => {
    await runToDeadline(<FakeEditor verdict={true} />)

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
  it('leaves the editor on screen when a flush reported UNSAFE', async () => {
    await runToDeadline(<FakeEditor verdict={false} />)

    expect(mocks.logOut, 'the session must still end').toHaveBeenCalledTimes(1)
    expect(replace, 'the last copy of the work must not be wiped').not.toHaveBeenCalled()
  })

  it('treats a THROWN flush as unsafe', async () => {
    await runToDeadline(<FakeEditor verdict="reject" />)

    expect(replace).not.toHaveBeenCalled()
  })

  /**
   * ⚑ An earlier flush SUCCEEDED and the final one is still in flight. The remembered verdict is
   * therefore `true` — and stale: it describes the document as it was a poll ago, and the teacher may
   * have typed since. This is the case the in-flight guard exists for, and the reason it is scripted
   * `[true, 'hang']` rather than just hanging: a flush that never succeeds at all leaves the verdict
   * at its initial `false`, so the test would pass with the guard deleted and prove nothing.
   * Confirmed by mutation — dropping `&& !flushing` fails this and only this.
   */
  it('treats a flush still IN FLIGHT as unsafe even after an earlier one succeeded', async () => {
    await runToDeadline(<FakeEditor verdict={[true, 'hang']} />)

    expect(mocks.logOut).toHaveBeenCalledTimes(1)
    expect(replace, 'a stale verdict must not clear the screen').not.toHaveBeenCalled()
  })

  /**
   * ⚑ Two editors, one safe and one not — the whole point of `runAll` returning a conjunction. An
   * `Array.some` here would clear the screen on the strength of the editor that had nothing to lose.
   */
  it('requires EVERY editor to be safe, not just one', async () => {
    await runToDeadline(
      <>
        <FakeEditor verdict={true} />
        <FakeEditor verdict={false} />
      </>,
    )

    expect(replace).not.toHaveBeenCalled()
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
