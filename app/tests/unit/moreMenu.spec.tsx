// @vitest-environment jsdom
/** The editor's More ▾ disclosure (2026-10-20): mouse and keyboard. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('@payloadcms/ui', () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    { children: React.ReactNode; onClick: () => void; extraButtonProps?: Record<string, unknown> }
  >(function Button({ children, onClick, extraButtonProps }, ref) {
    return (
      <button ref={ref} type="button" onClick={onClick} {...extraButtonProps}>
        {children}
      </button>
    )
  }),
}))

import { MoreMenu } from '@/components/LessonControls/MoreMenu'

afterEach(cleanup)

const trigger = () => screen.getByRole('button', { name: 'More ▾' })

describe('MoreMenu', () => {
  it('renders nothing when there is nothing to offer', () => {
    const { container } = render(<MoreMenu items={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('opens and closes from its button, and says which it is', () => {
    render(<MoreMenu items={[{ key: 'a', label: 'Show details', onSelect: vi.fn() }]} />)
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Show details' })).toBeTruthy()
    fireEvent.click(trigger())
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull()
  })

  it('runs the chosen item and closes', () => {
    const onSelect = vi.fn()
    render(<MoreMenu items={[{ key: 'c', label: 'Combine versions', onSelect }]} />)
    fireEvent.click(trigger())
    fireEvent.click(screen.getByRole('button', { name: 'Combine versions' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Combine versions' })).toBeNull()
  })

  it('Escape closes it and returns focus to the button', () => {
    render(<MoreMenu items={[{ key: 'a', label: 'Show details', onSelect: vi.fn() }]} />)
    fireEvent.click(trigger())
    screen.getByRole('button', { name: 'Show details' }).focus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('a click elsewhere closes it', () => {
    render(
      <>
        <p>Elsewhere</p>
        <MoreMenu items={[{ key: 'a', label: 'Show details', onSelect: vi.fn() }]} />
      </>,
    )
    fireEvent.click(trigger())
    fireEvent.mouseDown(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull()
  })
})
