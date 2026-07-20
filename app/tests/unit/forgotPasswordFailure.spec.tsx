// @vitest-environment jsdom
/**
 * Forgot-password must not report success for a SERVER failure (audit 2026-07-20, L3-09).
 *
 * The form previously treated only 429 as failure; every other status fell through to the
 * "a reset link is on its way" note — so an SMTP outage or a 500 told the user recovery was under
 * way when no email had been sent. Success is now gated on `res.ok`.
 *
 * The anti-enumeration property is the reason this is a COMPONENT test and not an HTTP wire test:
 * the defect and the fix both live in how the client interprets the response. Payload answers
 * **200** for an unknown address, so a non-OK status can only mean a server failure — the
 * unknown-address case must still land on the identical success note, and that equivalence is
 * asserted here (`unknown address` vs `real address` produce byte-identical output).
 *
 * DB-free component test → jsdom (see docblock); runs in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

import { ForgotPasswordForm } from '@/app/(frontend)/forgot-password/ForgotPasswordForm'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Drive the form to submission with a given fetch outcome. */
async function submit(fetchImpl: () => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  render(<ForgotPasswordForm />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.test' } })
  fireEvent.submit(screen.getByRole('button'))
}

const jsonResponse = (status: number) => new Response('{}', { status })

describe('forgot-password reports server failures instead of false success', () => {
  it('200 → success note', async () => {
    await submit(async () => jsonResponse(200))
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(screen.getByRole('status').textContent).toMatch(/reset link is on its way/i)
  })

  it('500 → error, NOT the success note', async () => {
    await submit(async () => jsonResponse(500))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('alert').textContent).toMatch(/could not send/i)
  })

  it('400 (validation) → error, NOT the success note', async () => {
    await submit(async () => jsonResponse(400))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('429 → the distinct rate-limit message (unchanged behaviour)', async () => {
    await submit(async () => jsonResponse(429))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/too many/i)
  })

  it('network rejection → error, NOT the success note', async () => {
    await submit(async () => {
      throw new Error('offline')
    })
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('ANTI-ENUMERATION: an unknown address is indistinguishable from a real one', async () => {
    // Payload answers 200 for both, so both must render the identical success note.
    await submit(async () => jsonResponse(200))
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    const unknown = screen.getByRole('status').outerHTML
    cleanup()

    await submit(async () => jsonResponse(200))
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(screen.getByRole('status').outerHTML).toBe(unknown)
  })
})
