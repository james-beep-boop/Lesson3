import { describe, it, expect } from 'vitest'

import { isSafeRedirect } from '@/lib/safeRedirect'

describe('isSafeRedirect', () => {
  it('accepts internal absolute paths', () => {
    expect(isSafeRedirect('/admin')).toBe(true)
    expect(isSafeRedirect('/lessons/63?format=standard')).toBe(true)
  })
  it('rejects protocol-relative and external URLs (open-redirect guard)', () => {
    expect(isSafeRedirect('//evil.com')).toBe(false)
    expect(isSafeRedirect('https://evil.com')).toBe(false)
    expect(isSafeRedirect('http://evil.com')).toBe(false)
  })
  it('rejects non-paths and non-strings', () => {
    expect(isSafeRedirect('admin')).toBe(false) // no leading slash
    expect(isSafeRedirect('')).toBe(false)
    expect(isSafeRedirect(undefined)).toBe(false)
    expect(isSafeRedirect(null)).toBe(false)
  })
})
