// @vitest-environment jsdom
/**
 * SearchBox regressions (CodeRabbit follow-ups on PR #40, 2026-07-04). Pins three behaviors:
 *
 *  1. The debounce navigates via router.replace with the encoded query.
 *  2. A pending debounce is cancelled on unmount — `navigate` drives the GLOBAL Next router, so a
 *     timer surviving unmount would yank a user who just clicked into a lesson back to `/?q=…`.
 *  3. Prop re-sync distinguishes provenance: the server echo of the box's OWN navigation must not
 *     clobber keystrokes typed while that request was in flight, while an EXTERNAL navigation
 *     (another link changing/clearing `q`) must re-sync the input AND cancel any pending debounce.
 *
 * Component test → jsdom (per-file docblock); DB-free, runs in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

import SearchBox from '@/app/(frontend)/SearchBox'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  replace.mockClear()
})

const input = (): HTMLInputElement => screen.getByRole('searchbox')

describe('SearchBox', () => {
  it('debounces typing into a router.replace of the encoded query', () => {
    render(<SearchBox initialQuery="" />)
    fireEvent.change(input(), { target: { value: 'cell walls' } })
    expect(replace).not.toHaveBeenCalled() // still inside the debounce window
    vi.advanceTimersByTime(250)
    expect(replace).toHaveBeenCalledWith('/?q=cell%20walls', { scroll: false })
  })

  it('cancels a pending debounce on unmount (no stray navigation after leaving the page)', () => {
    const { unmount } = render(<SearchBox initialQuery="" />)
    fireEvent.change(input(), { target: { value: 'bio' } })
    unmount() // user clicked a lesson row before the debounce fired
    vi.advanceTimersByTime(1000)
    expect(replace).not.toHaveBeenCalled()
  })

  it("re-syncs on an external q change but never on its own navigation's echo", () => {
    const { rerender } = render(<SearchBox initialQuery="" />)

    // Type + let the debounce navigate.
    fireEvent.change(input(), { target: { value: 'bio' } })
    vi.advanceTimersByTime(250)
    expect(replace).toHaveBeenCalledWith('/?q=bio', { scroll: false })

    // Keep typing before the server round trip lands…
    fireEvent.change(input(), { target: { value: 'biology' } })
    // …then the echo of OUR earlier navigation re-renders the page with q="bio".
    rerender(<SearchBox initialQuery="bio" />)
    expect(input().value).toBe('biology') // in-flight typing NOT clobbered

    // An EXTERNAL navigation (e.g. a clear-search link → `/`) re-syncs the input…
    rerender(<SearchBox initialQuery="" />)
    expect(input().value).toBe('')

    // …and cancels the pending "biology" debounce, so it can't navigate straight back.
    replace.mockClear()
    vi.advanceTimersByTime(1000)
    expect(replace).not.toHaveBeenCalled()
  })
})
