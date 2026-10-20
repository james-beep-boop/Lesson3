// @vitest-environment jsdom
/**
 * The lesson page's Share ▾ under Standard / Advanced tools (2026-10-20): Download as JSON and the
 * Email all entries are advanced, and Advanced never offers Email when the server cannot send it.
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
import type { InterfaceMode } from '@/lib/advancedTools'

afterEach(cleanup)

function open(mode: InterfaceMode, smtpEnabled: boolean) {
  render(
    <ShareMenu planId={1} versionId={2} semver="1.0.0" mode={mode} smtpEnabled={smtpEnabled} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Share ▾' }))
}
const json = () => screen.queryByRole('button', { name: 'Download as JSON' })
const email = () => screen.queryAllByRole('button', { name: /^Email all/ })

describe('ShareMenu — Standard / Advanced tools', () => {
  it('Standard hides Download as JSON and Email all, even with email set up', () => {
    open('standard', true)
    expect(json()).toBeNull()
    expect(email()).toHaveLength(0)
    // The everyday entries stay.
    expect(screen.getByRole('button', { name: 'Download all — PDF (.zip)' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Message a colleague' })).toBeTruthy()
  })

  it('Advanced shows Download as JSON, and Email all only when email is set up', () => {
    open('advanced', false)
    expect(json()).not.toBeNull()
    expect(email()).toHaveLength(0)
    cleanup()
    open('advanced', true)
    expect(email()).toHaveLength(2)
  })

  it('defaults to Standard when no mode is passed', () => {
    render(<ShareMenu planId={1} versionId={2} smtpEnabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Share ▾' }))
    expect(json()).toBeNull()
    expect(email()).toHaveLength(0)
  })
})
