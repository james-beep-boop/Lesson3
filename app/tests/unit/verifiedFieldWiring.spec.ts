/**
 * Email-verification WIRING guard (2026-07-09 open-registration hardening).
 *
 * Two invariants a future edit could silently break:
 *  1. `auth.verify` stays ON with the FRONTEND link — Payload's default verification email points
 *     at /admin/<collection>/verify/<token>, a panel route teachers can't use.
 *  2. The `_verified` base-field OVERRIDE keeps its Site-Admin-only create/update axes. Payload's
 *     default gives EVERY authenticated user all three axes (defaultAccess in installed
 *     auth/baseFields/verification.js) — and open registration makes the create axis
 *     load-bearing: without the override, a signup body carrying `_verified: true` self-verifies.
 *     tests/http proves the strip end-to-end; this pins the wiring DB-free so a mis-wire is
 *     caught the instant it lands.
 */
import { describe, it, expect } from 'vitest'

import { Users } from '../../src/collections/Users'
import { emailReadAccess, siteAdminField } from '../../src/access'
import { verifyEmailThrottledEndpoint } from '../../src/endpoints/verifyEmail'

const fieldNamed = (name: string) =>
  Users.fields.find((f) => 'name' in f && f.name === name) as
    | { access?: Record<string, unknown>; index?: boolean }
    | undefined

const verifiedField = fieldNamed('_verified')

describe('email-verification wiring (auth.verify + the _verified override)', () => {
  it('auth.verify is enabled with a custom email generator', () => {
    const verify = (Users.auth as { verify?: unknown }).verify
    expect(verify).toBeTruthy()
    expect(typeof (verify as { generateEmailHTML?: unknown }).generateEmailHTML).toBe('function')
  })

  it('the verification email links the FRONTEND /verify-email page, not /admin', async () => {
    const verify = (Users.auth as {
      verify: { generateEmailHTML: (args: unknown) => string | Promise<string> }
    }).verify
    const html = await verify.generateEmailHTML({ token: 'TOKEN123' })
    expect(html).toContain('/verify-email?token=TOKEN123')
    expect(html).not.toContain('/admin')
  })

  it('_verified create/update are Site-Admin-only; read is self-or-admin', () => {
    expect(verifiedField).toBeTruthy()
    expect(verifiedField?.access?.create).toBe(siteAdminField)
    expect(verifiedField?.access?.update).toBe(siteAdminField)
    expect(verifiedField?.access?.read).toBe(emailReadAccess)
  })

  it('email update is Site-Admin-only — a self-service change would bypass verification (Codex 2026-07-10)', () => {
    expect(fieldNamed('email')?.access?.update).toBe(siteAdminField)
  })

  it('_verificationToken is indexed — the public verify endpoint looks it up per request', () => {
    expect(fieldNamed('_verificationToken')?.index).toBe(true)
  })

  it('the throttled verify endpoint is registered with the exact native path+method it must shadow', () => {
    expect(Users.endpoints).toContain(verifyEmailThrottledEndpoint)
    // Must match installed payload's auth endpoint ('/verify/:id', post) or the shadow silently
    // stops applying; the http 429 test is the wire-level proof it does.
    expect(verifyEmailThrottledEndpoint.path).toBe('/verify/:id')
    expect(verifyEmailThrottledEndpoint.method).toBe('post')
  })
})
