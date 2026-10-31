// @vitest-environment jsdom
/**
 * The administrator's reset link as a QR code (operator decision 2026-10-31). At a school with no
 * email the person scans it with their phone instead of retyping a long one-time address.
 *
 * Pinned here: the code encodes exactly the link on screen (checked against the encoder's own grid,
 * so a drawing bug cannot pass), it is dark on white whatever the theme, and a link a phone cannot
 * open (localhost) shows an explanation instead of a code that would fail on scan.
 */
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { encode } from 'uqr'

import { linkOnlyWorksOnThisComputer, ResetLinkQr } from '@/components/Manage/ResetLinkQr'

afterEach(cleanup)

const LAN_LINK =
  'http://192.168.1.50:3001/reset-password?token=0123456789abcdef0123456789abcdef01234567'

/** Read the dark modules back out of the drawn path, as a set of "x,y". */
function drawnModules(d: string): Set<string> {
  return new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map((m) => `${m[1]},${m[2]}`))
}

describe('ResetLinkQr', () => {
  it('draws exactly the modules of the link it is given, on a white square', () => {
    const { container } = render(<ResetLinkQr link={LAN_LINK} name="Amina" />)
    const svg = screen.getByRole('img', { name: 'QR code of the password reset link for Amina' })
    const grid = encode(LAN_LINK, { ecc: 'M', border: 4 }).data
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${grid.length} ${grid.length}`)

    const expected = new Set<string>()
    grid.forEach((row, y) => row.forEach((dark, x) => dark && expected.add(`${x},${y}`)))
    const path = container.querySelector('path')
    expect(path?.getAttribute('fill')).toBe('#000')
    expect(drawnModules(path?.getAttribute('d') ?? '')).toEqual(expected)
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#fff')

    // The four-module quiet zone the specification asks for: the outer ring is all white.
    for (const key of expected) {
      const [x, y] = key.split(',').map(Number)
      expect(x >= 4 && y >= 4 && x < grid.length - 4 && y < grid.length - 4).toBe(true)
    }
  })

  it('explains, instead of drawing a code, when the link points to this computer only', () => {
    const { container } = render(
      <ResetLinkQr link="http://localhost:3001/reset-password?token=abc" name="Amina" />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('note').textContent).toContain('a phone cannot open it')
  })
})

describe('linkOnlyWorksOnThisComputer', () => {
  it.each([
    'http://localhost:3001/reset-password?token=a',
    'http://LOCALHOST/reset-password?token=a',
    'http://app.localhost/reset-password?token=a',
    'http://127.0.0.1:3001/reset-password?token=a',
    'http://[::1]:3001/reset-password?token=a',
    'http://0.0.0.0:3001/reset-password?token=a',
    '/reset-password?token=a',
  ])('treats %s as unreachable from a phone', (link) => {
    expect(linkOnlyWorksOnThisComputer(link)).toBe(true)
  })

  it.each([
    LAN_LINK,
    'http://lessons.school.local:3001/reset-password?token=a',
    'https://test.kenyalessons.org/reset-password?token=a',
  ])('treats %s as reachable', (link) => {
    expect(linkOnlyWorksOnThisComputer(link)).toBe(false)
  })
})
