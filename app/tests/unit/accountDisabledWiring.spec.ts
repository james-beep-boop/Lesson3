/**
 * WIRING guard for the `ACCOUNT_DISABLED` wire repair.
 *
 * ⚑ THIS EXISTS BECAUSE THE CONTRACT TEST COULD NOT SEE THE PRODUCTION FAILURE, and the repair for
 * that failure has the same blind spot one level along.
 *
 * The original defect: `formatErrors` keeps `data` only when `incoming instanceof APIError`, and a
 * Next production build can hand it an error from a different server chunk — same properties,
 * different constructor identity. The unit contract test passed throughout, because it calls
 * `formatErrors` from the SAME module instance the subclass extended. Only `tests/http`, over the
 * wire against a real build, saw `errors[0].data.code` come back `undefined`.
 *
 * The repair is an `afterError` hook. Its own unit tests call `preserveAccountDisabledWire`
 * DIRECTLY, so deleting the registration from `Users.ts` would leave every one of them green and
 * only the compose-stack HTTP suite would notice — exactly the shape of the bug it was written to
 * fix. This pins the registration itself, DB-free, so a mis-wire fails the instant it lands.
 *
 * Same idiom as `verifiedFieldWiring.spec.ts`.
 */
import { describe, it, expect } from 'vitest'

import { Users } from '../../src/collections/Users'
import { preserveAccountDisabledWire } from '../../src/errors/AccountDisabled'
import { refuseDisabledLogin } from '../../src/hooks/userRoles'

describe('ACCOUNT_DISABLED wiring', () => {
  it('registers the wire repair as an afterError hook', () => {
    const hooks = (Users.hooks ?? {}) as { afterError?: unknown[] }
    expect(
      hooks.afterError ?? [],
      'the ACCOUNT_DISABLED code survives a production bundle only because this hook re-attaches it',
    ).toContain(preserveAccountDisabledWire)
  })

  it('registers the login gate that THROWS the error the repair rescues', () => {
    // The pair is only useful together: without the gate nothing throws, and without the repair the
    // throw loses its code in production.
    const hooks = (Users.hooks ?? {}) as { beforeLogin?: unknown[] }
    expect(hooks.beforeLogin ?? []).toContain(refuseDisabledLogin)
  })
})
