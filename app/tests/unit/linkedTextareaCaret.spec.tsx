// @vitest-environment jsdom
/**
 * Consecutive link insertions land at the caret the previous insertion PLACED (audit F-C63-005).
 *
 * After inserting, the field refocuses and then sets the caret. `focus()` re-ran the remembered-
 * target handler with the browser's pre-selection caret, and a programmatic `setSelectionRange`
 * raises no event it listens to — so an immediate second insertion used a stale position (after
 * the trailing word in Chromium, before the first link in WebKit). jsdom moves the caret to the end
 * when the value changes, which reproduces the Chromium half.
 */
import React, { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TextareaFieldClientProps } from 'payload'

const store = vi.hoisted(() => {
  let value = ''
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: string) => {
      value = next
      for (const l of listeners) l()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
})

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useField: () => ({
    value: useSyncExternalStore(store.subscribe, store.get),
    setValue: store.set,
    disabled: false,
  }),
  TextareaField: () => (
    <textarea
      aria-label="Learner experience"
      value={useSyncExternalStore(store.subscribe, store.get)}
      onChange={(e) => store.set(e.target.value)}
    />
  ),
  Button: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('../../src/components/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
}))

import LinkedTextarea from '../../src/components/LinkedTextarea'
import {
  clearActiveLinkTarget,
  openActiveLinkTarget,
} from '../../src/components/LinkedTextarea/activeTarget'

afterEach(() => {
  cleanup()
  clearActiveLinkTarget()
  vi.useRealTimers()
})

const insertAddress = async (address: string) => {
  act(() => openActiveLinkTarget())
  fireEvent.change(screen.getByPlaceholderText('http://ares.local/modules/…'), {
    target: { value: address },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Insert address' }))
  await act(async () => {
    vi.runAllTimers() // the deferred refocus + caret placement
  })
}

describe('consecutive link insertion', () => {
  it('inserts the second address right after the first, at the visible caret', async () => {
    vi.useFakeTimers()
    store.set('Alpha Beta')
    render(
      <LinkedTextarea
        {...({ path: 'lessons.0.framework.0.learnerExperience' } as TextareaFieldClientProps)}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Learner experience' }) as HTMLTextAreaElement
    field.focus()
    field.setSelectionRange(5, 5) // after "Alpha"
    fireEvent.mouseUp(field)

    await insertAddress('https://example.invalid/one')
    await insertAddress('https://example.invalid/two')

    expect(store.get()).toBe('Alpha(https://example.invalid/one)(https://example.invalid/two) Beta')
  })
})
