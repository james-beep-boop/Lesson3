import { describe, it, expect } from 'vitest'

import { formatFromResources, resourcesIncluded } from '@/lib/format'

describe('resources ↔ format mapping', () => {
  it('checked → standard (Resource column), unchecked → compact', () => {
    expect(formatFromResources(true)).toBe('standard')
    expect(formatFromResources(false)).toBe('compact')
  })
  it('round-trips', () => {
    expect(resourcesIncluded('standard')).toBe(true)
    expect(resourcesIncluded('compact')).toBe(false)
    expect(resourcesIncluded(formatFromResources(true))).toBe(true)
    expect(resourcesIncluded(formatFromResources(false))).toBe(false)
  })
})
