// @vitest-environment jsdom
import React from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { it, expect, vi, afterEach } from 'vitest'
const auth = vi.hoisted(() => ({ deadline: 0, logout: vi.fn<() => Promise<void>>() }))
vi.mock('@payloadcms/ui', () => ({
  useAuth: () => ({ user: { id: 1 }, tokenExpirationMs: auth.deadline, logOut: auth.logout }),
  useConfig: () => ({
    config: {
      routes: { admin: '/admin' },
      admin: { routes: { inactivity: '/logout-inactivity' } },
    },
  }),
}))
import IdleLogout from '../../src/components/IdleLogout'
import { useEditRecoveryFlushRegistry } from '../../src/components/EditRecovery/flushRegistry'
let safe = true
function MutableEditor() {
  const { register } = useEditRecoveryFlushRegistry()
  React.useEffect(() => register({ flush: async () => {}, isSafe: () => safe }), [register])
  return (
    <textarea
      aria-label="Audit live text"
      onChange={() => {
        safe = false
      }}
    />
  )
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
it('audit: work becoming unsafe while logout is pending must survive the navigation decision', async () => {
  vi.useFakeTimers()
  const replace = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/admin/collections/lesson-bundle-versions/7', replace },
  })
  let finish!: () => void
  auth.logout.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  auth.deadline = Date.now() + 1000
  safe = true
  render(
    <IdleLogout>
      <MutableEditor />
    </IdleLogout>,
  )
  await act(async () => {
    vi.advanceTimersByTime(30000)
  })
  expect(auth.logout).toHaveBeenCalledTimes(1)
  expect(replace).not.toHaveBeenCalled()
  // A later form change invalidates the registered live probe while the network request is pending.
  safe = false
  await act(async () => {
    finish()
    await Promise.resolve()
  })
  expect(replace, 'the live safety probe is now false').not.toHaveBeenCalled()
})
