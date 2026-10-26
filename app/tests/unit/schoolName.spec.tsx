import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import SchoolName from '../../src/components/SchoolName'
import { parseSchoolName, readSchoolName } from '../../src/lib/schoolName'
import { parseSaveBody } from '../../src/endpoints/systemSettingsSave'

const body = { password: 'pw', expectedUpdatedAt: '2026-10-26T10:00:00Z' }

describe('school name', () => {
  it('trims, permits 80 characters and lets empty text clear the label', () => {
    expect(parseSchoolName('  Kisumu Boys High School  ')).toBe('Kisumu Boys High School')
    expect(parseSchoolName('a'.repeat(80))).toHaveLength(80)
    expect(parseSchoolName('   ')).toBe('')
    expect(
      parseSaveBody({ ...body, changes: { schoolName: '  Kisumu  ', advancedTools: true } })
        .changes,
    ).toEqual({ schoolName: 'Kisumu', advancedTools: true })
  })
  it('refuses non-text, overlong names, line breaks and controls before trimming', () => {
    for (const name of [
      null,
      3,
      {},
      'a'.repeat(81),
      'School\n',
      '\tSchool',
      'A\u0000B',
      'A\u007fB',
      'A\u0085B',
      'A\u2028B',
      'A\u2029B',
    ]) {
      expect(() => parseSchoolName(name)).toThrow()
      expect(() => parseSaveBody({ ...body, changes: { schoolName: name } })).toThrow()
    }
  })
  it('renders no placeholder when unset, and escapes markup as ordinary text', () => {
    expect(renderToStaticMarkup(<SchoolName name={null} />)).toBe('')
    expect(renderToStaticMarkup(<SchoolName name="" />)).toBe('')
    const html = renderToStaticMarkup(<SchoolName name={'<img src=x onerror=alert(1)>'} heading />)
    expect(html).toContain('<h1')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })
  it('selects only the public label and shows nothing for missing, invalid or failed reads', async () => {
    const findGlobal = vi
      .fn()
      .mockResolvedValueOnce({ schoolName: 'Kisumu' })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ schoolName: 'A\nB' })
      .mockRejectedValueOnce(new Error('database offline'))
    const payload = { findGlobal } as unknown as Payload
    expect(await readSchoolName(payload)).toBe('Kisumu')
    expect(findGlobal).toHaveBeenCalledWith({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: true,
      select: { schoolName: true },
    })
    expect(await readSchoolName(payload)).toBeNull()
    expect(await readSchoolName(payload)).toBeNull()
    expect(await readSchoolName(payload)).toBeNull()
  })
})
