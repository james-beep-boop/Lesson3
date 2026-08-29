// @vitest-environment jsdom
/**
 * Share → Email sends the format the menu entry named.
 *
 * ⚑ THE FORMAT IS THE WHOLE POINT OF THIS FILE. `EmailModal` hardcoded `?as=docx` while the endpoint
 * had accepted `?as=docx|pdf` from the start, so Share offered both formats for Download and silently
 * only Word for Email — a UI gap against SPEC §10, which defines an artifact as
 * `(version, document, kind)` and says "Only the deliverable `kind` varies".
 *
 * ⚑ AND THIS IS THE FAILURE MODE A UI TEST WOULD MISS: a regression here does not break anything
 * visible. The menu still says "PDF", the modal still opens, the send still queues, the recipient
 * still gets a mail — just the wrong attachment. So the assertion is on the REQUEST, not the render.
 */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import EmailModal from '@/app/(frontend)/lessons/[id]/EmailModal'

const sent: string[] = []

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      sent.push(String(url))
      return new Response(JSON.stringify({ queued: true }), { status: 202 })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const send = async (format: 'docx' | 'pdf') => {
  render(<EmailModal versionId={7} format={format} onClose={() => {}} onSent={() => {}} />)
  fireEvent.change(screen.getByLabelText(/Recipient email/i), {
    target: { value: 'teacher@example.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  // The POST is fired synchronously from the submit handler; let its microtask settle.
  await Promise.resolve()
}

describe('emailing a lesson plan sends the chosen deliverable kind', () => {
  it('sends Word when the Word entry opened the form', async () => {
    await send('docx')

    expect(sent[0]).toContain('as=docx')
    expect(sent[0]).not.toContain('as=pdf')
  })

  it('sends PDF when the PDF entry opened the form', async () => {
    await send('pdf')

    expect(sent[0]).toContain('as=pdf')
    expect(sent[0]).not.toContain('as=docx')
  })

  // The copy has to move with the format too: "a .zip of Word files" was hardcoded, and would be a
  // plain lie on the PDF entry — the one place a user could catch the bug before the mail arrives.
  it('names the format it is about to send', async () => {
    render(<EmailModal versionId={7} format="pdf" onClose={() => {}} onSent={() => {}} />)

    expect(screen.getByText(/a \.zip of PDF files/i)).toBeTruthy()
    expect(screen.queryByText(/a \.zip of Word files/i)).toBeNull()
  })
})
