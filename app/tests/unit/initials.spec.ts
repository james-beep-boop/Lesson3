import { describe, it, expect } from 'vitest'

import { initials } from '@/lib/initials'

describe('initials', () => {
  it('uses first + last initial for multi-word names', () => {
    expect(initials('Maria Okonkwo')).toBe('MO')
    expect(initials('  Ada B. Lovelace ')).toBe('AL')
  })
  it('uses the first two letters of a single word', () => {
    expect(initials('Cher')).toBe('CH')
  })
  it('initials off the local part of an email', () => {
    expect(initials('jane.doe@school.org')).toBe('JD')
    expect(initials('teacher@lesson3.local')).toBe('TE')
  })
  it('falls back to "?" for empty input', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})
