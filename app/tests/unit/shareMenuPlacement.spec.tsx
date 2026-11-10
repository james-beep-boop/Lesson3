// @vitest-environment jsdom
/**
 * Which way the lesson page's Share ▾ panel opens (2026-11-10). Share is the last button on a row
 * that sits at the right, so the panel hangs from the button's right edge and opens leftwards; a
 * left-hung panel ran off a phone screen. If the row wraps and Share lands at the start of a line,
 * opening leftwards would run off the other side, so the panel flips to open rightwards. jsdom has
 * no layout, so the panel's measured position is stubbed.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import ShareMenu from '@/app/(frontend)/lessons/[id]/ShareMenu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Every element reports this left edge (the panel is the only one the menu measures). */
function panelLeftAt(left: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left,
    right: left + 224,
    top: 0,
    bottom: 300,
    width: 224,
    height: 300,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'Share ▾' }))
const panel = () => document.querySelector('.share-menu') as HTMLElement

describe('ShareMenu — panel placement', () => {
  it('opens leftwards from the button when the panel fits on screen', () => {
    panelLeftAt(150)
    render(<ShareMenu planId={1} versionId={2} />)
    toggle()
    expect(panel().className).toBe('share-menu')
  })

  it('flips to open rightwards when opening leftwards would run off the left edge', () => {
    panelLeftAt(-120)
    render(<ShareMenu planId={1} versionId={2} />)
    toggle()
    expect(panel().className).toBe('share-menu share-menu--rightward')
  })

  it('measures afresh on every opening', () => {
    panelLeftAt(-120)
    render(<ShareMenu planId={1} versionId={2} />)
    toggle()
    expect(panel().className).toContain('share-menu--rightward')
    toggle()
    expect(panel()).toBeNull()
    vi.restoreAllMocks()
    panelLeftAt(150)
    toggle()
    expect(panel().className).toBe('share-menu')
  })
})
