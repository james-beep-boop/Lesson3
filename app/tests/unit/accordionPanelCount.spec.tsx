// @vitest-environment jsdom

/**
 * `AccordionPanel`'s `count` (Proposal B, 2026-10-22): a closed "My saved versions" or "Your Drafts"
 * still says how much it holds. The count is part of the disclosure button's accessible name, and a
 * zero shows nothing rather than "(0)".
 */
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

import { AccordionPanel, AccordionProvider } from '../../src/components/Manage/Accordion'

afterEach(cleanup)

function Drafts({ count }: { count?: number }) {
  return (
    <AccordionProvider available={['plans', 'plans.drafts']} initialOpen={['plans']}>
      <AccordionPanel id="plans" title="Lesson plans">
        <AccordionPanel id="plans.drafts" title="Your Drafts" count={count}>
          <p>rows</p>
        </AccordionPanel>
      </AccordionPanel>
    </AccordionProvider>
  )
}

describe('AccordionPanel count', () => {
  it('names a non-zero count on the closed heading', () => {
    render(<Drafts count={2} />)
    const button = screen.getByRole('button', { name: 'Your Drafts (2)' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows nothing for zero or no count', () => {
    render(<Drafts count={0} />)
    expect(screen.getByRole('button', { name: 'Your Drafts' })).toBeTruthy()
    cleanup()
    render(<Drafts />)
    expect(screen.getByRole('button', { name: 'Your Drafts' })).toBeTruthy()
  })
})
