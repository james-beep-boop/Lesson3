// @vitest-environment jsdom
import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const nav = vi.hoisted(() => ({ path: '/lessons/1', query: '', refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ refresh: nav.refresh }),
}))
import RefreshNavigation from '../../src/components/RefreshNavigation'

afterEach(() => {
  cleanup()
  nav.path = '/lessons/1'
  nav.query = ''
  nav.refresh.mockClear()
})

describe('navigation freshness', () => {
  it('does not refresh on arrival or unchanged rerenders', () => {
    const { rerender } = render(<RefreshNavigation />)
    rerender(<RefreshNavigation />)
    expect(nav.refresh).not.toHaveBeenCalled()
  })

  it('refreshes a retained layout after soft navigation without a refresh loop', () => {
    const { rerender } = render(<RefreshNavigation />)
    nav.path = '/'
    rerender(<RefreshNavigation />)
    expect(nav.refresh).toHaveBeenCalledTimes(1)
    rerender(<RefreshNavigation />)
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })

  it('also refreshes after query-only navigation such as another reply page', () => {
    const { rerender } = render(<RefreshNavigation />)
    nav.query = 'page=2'
    rerender(<RefreshNavigation />)
    expect(nav.refresh).toHaveBeenCalledTimes(1)
    rerender(<RefreshNavigation />)
    expect(nav.refresh).toHaveBeenCalledTimes(1)
  })
})
