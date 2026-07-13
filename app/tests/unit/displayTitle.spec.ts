import { describe, expect, it } from 'vitest'

import { displayTitle } from '@/lib/displayTitle'

describe('displayTitle (D5 display-level casing)', () => {
  it('title-cases an all-caps stored title', () => {
    expect(displayTitle('BIOLOGY GRADE 10: PLANT TRANSPORT')).toBe('Biology Grade 10: Plant Transport')
  })

  it('keeps digits/punctuation and re-capitalizes after them', () => {
    expect(displayTitle('CHEMISTRY GRADE 10: ACIDS, BASES & SALTS (1.2)')).toBe(
      'Chemistry Grade 10: Acids, Bases & Salts (1.2)',
    )
  })

  it('passes mixed-case titles through untouched (deliberate casing)', () => {
    expect(displayTitle('Plant Transport in C4 plants')).toBe('Plant Transport in C4 plants')
    expect(displayTitle('pH and buffers')).toBe('pH and buffers')
  })

  it('passes letterless or empty strings through', () => {
    expect(displayTitle('1.2.3')).toBe('1.2.3')
    expect(displayTitle('')).toBe('')
  })
})
