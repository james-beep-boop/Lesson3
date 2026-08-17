/**
 * The `ACCOUNT_DISABLED` wire contract (D13a step 4).
 *
 * ⚑ WHY THIS IS A TEST AND NOT A COMMENT. Two failures on the reset path are both HTTP 403 — an
 * invalid/expired token, and a refusal for a disabled account — so the client cannot tell them apart
 * by status, and matching translated message TEXT breaks silently on any locale change. The whole
 * feature therefore rests on one serialised field surviving `formatErrors`, and that field disappears
 * from a `Forbidden` without a single type error or failing assertion anywhere else.
 *
 * So this asserts the PARSED SHAPE through Payload's own `formatErrors` — the real function the HTTP
 * layer uses — rather than a substring of a body or the class's own properties. A test that checked
 * `err.data.code` would pass against an error whose `data` never reaches the wire.
 */
import { describe, it, expect } from 'vitest'
// `formatErrors` comes from the package ROOT (`payload/dist/index.js` re-exports it), not from
// `payload/shared` — checked against the installed package's own exports rather than assumed.
import { APIError, Forbidden, formatErrors } from 'payload'

import { AccountDisabledError, ACCOUNT_DISABLED_CODE } from '../../src/errors/AccountDisabled'

/** The shape the two client forms destructure. Mirrors what they actually read, nothing more. */
type Wire = { errors: { name?: string; message?: string; data?: { code?: string } }[] }

describe('AccountDisabledError', () => {
  it('serialises to the exact shape both forms key on', () => {
    const wire = formatErrors(new AccountDisabledError()) as Wire
    expect(wire.errors).toHaveLength(1)
    expect(wire.errors[0]!.data?.code).toBe(ACCOUNT_DISABLED_CODE)
    // The message still reaches the client — the code is what is branched on, not what is shown.
    expect(wire.errors[0]!.message).toBeTruthy()
  })

  it('is a 403, like every other refusal on this path', () => {
    // Not a distinguishing feature — asserted precisely BECAUSE it collides with the invalid-token
    // error. If this ever became a different status, the elaborate code mechanism would be
    // unnecessary and someone should notice.
    expect(new AccountDisabledError().status).toBe(403)
  })

  it('carries the code even with custom copy', () => {
    const wire = formatErrors(new AccountDisabledError('Different words entirely.')) as Wire
    expect(wire.errors[0]!.data?.code).toBe(ACCOUNT_DISABLED_CODE)
  })

  /**
   * ⚑ THE TRAP, PINNED. `formatErrors` emits `{ name, data, message }` only when the error is an
   * `APIError`/`ValidationError` AND `incoming.data` is truthy; otherwise it degrades to a bare
   * `{ message }`. These two cases are the plan's rejected alternatives, and they fail in exactly the
   * way that would be invisible in review.
   */
  it('a plain Forbidden CANNOT carry the code — which is why this class exists', () => {
    const wire = formatErrors(new Forbidden()) as Wire
    expect(wire.errors[0]!.data).toBeUndefined()
  })

  it('an APIError with no data degrades to a bare message', () => {
    const wire = formatErrors(new APIError('Token is either invalid or has expired.', 403)) as Wire
    expect(wire.errors[0]!.data).toBeUndefined()
    // …and this is the OTHER 403 the forms must not mistake for a disabled account. Its absence of a
    // code is the whole disambiguator, so it is asserted rather than assumed.
    expect(wire.errors[0]!.message).toContain('invalid or has expired')
  })
})
