// @vitest-environment jsdom
/**
 * Forgot-password must NOT leak account existence (audit 2026-07-20, L3-R1).
 *
 * History, because this test now pins the OPPOSITE of what it originally asserted: #119 added a
 * `!res.ok` branch so server failures surfaced instead of showing a false success. That was reverted
 * the same day — it created an enumeration oracle. In installed Payload, an unknown address returns
 * EARLY (`if (!user) return null`) so no email is attempted => 200, while a real account falls
 * through to an unguarded `await email.sendEmail(...)` => throws on SMTP failure => non-2xx. So a
 * non-OK status occurs ONLY for addresses that exist, and showing it discriminates registered users
 * on an unauthenticated endpoint.
 *
 * The invariant under test: **for any server-side outcome, the rendered result is identical.**
 * 429 is exempt (it describes the REQUESTER, not the account) and a network rejection is exempt
 * (it happens client-side, before any account-dependent branch).
 *
 * The known cost — a genuine send failure looks like success — is NOT fixable here; it needs the
 * server to stop failing differently (queue the email with retry). See the component header.
 *
 * DB-free component test → jsdom; runs in `test:unit`.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

import { ForgotPasswordForm } from '@/app/(frontend)/forgot-password/ForgotPasswordForm'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Submit `address` with a given fetch outcome, and return what the user ends up seeing. */
async function submitAndRender(
  address: string,
  fetchImpl: () => Promise<Response>,
): Promise<{ role: 'status' | 'alert'; html: string }> {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  const { container } = render(<ForgotPasswordForm />)
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: address } })
  fireEvent.submit(screen.getByRole('button'))
  // Either outcome renders exactly one live region: role=status (success) or role=alert (error).
  const el = await waitFor(() => {
    const found = container.querySelector('[role="status"], [role="alert"]')
    if (!found) throw new Error('no live region rendered yet')
    return found as HTMLElement
  })
  return { role: el.getAttribute('role') as 'status' | 'alert', html: el.outerHTML }
}

const jsonResponse = (status: number) => new Response('{}', { status })

describe('forgot-password never leaks whether an account exists', () => {
  // The oracle in the wild: SMTP is down. Payload 200s the unknown address (no send attempted) and
  // 500s the real one (send threw). Distinct addresses AND distinct statuses — the exact pairing
  // that leaked. The user-visible result must be identical.
  it('SMTP outage: unknown address (200) and registered address (500) render IDENTICALLY', async () => {
    const unknown = await submitAndRender('no-such-user@example.invalid', async () => jsonResponse(200))
    cleanup()
    const registered = await submitAndRender('real-teacher@lesson3.local', async () => jsonResponse(500))

    expect(registered.role).toBe(unknown.role)
    expect(registered.html).toBe(unknown.html)
    expect(unknown.role).toBe('status')
  })

  it.each([200, 400, 404, 500, 502])('status %i renders the same success note', async (status) => {
    const { role, html } = await submitAndRender('someone@example.test', async () => jsonResponse(status))
    expect(role).toBe('status')
    expect(html).toMatch(/reset link is on its way/i)
  })

  it('429 is the one server status that may differ — it describes the requester, not the account', async () => {
    const { role, html } = await submitAndRender('someone@example.test', async () => jsonResponse(429))
    expect(role).toBe('alert')
    expect(html).toMatch(/too many/i)
  })

  it('a network rejection may surface — it happens before any account-dependent branch', async () => {
    const { role } = await submitAndRender('someone@example.test', async () => {
      throw new Error('offline')
    })
    expect(role).toBe('alert')
  })
})
