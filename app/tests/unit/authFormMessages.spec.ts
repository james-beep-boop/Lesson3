/**
 * The message matrix §7 locks in for BOTH consumers of the `beforeLogin` seam.
 *
 * ⚑ THE POINT IS THAT THERE ARE TWO CONSUMERS. `beforeLogin` runs in `login` AND, inline, in
 * `resetPassword` — so adding `AccountDisabledError` changed the failure vocabulary of two forms, and
 * review round 6 caught the plan updating only one of them. Both are asserted here, in one file, so
 * the pair stays visible.
 *
 * ⚑ AND THE ASSERTIONS ARE ABOUT DISAMBIGUATION, not copy. Two of the three login outcomes are HTTP
 * 403, which is exactly why all three are pinned: a regression that collapsed them would still return
 * the right status and still render a plausible sentence. What must not happen is a disabled user
 * being sent to look for a verification email that does not exist, or a user with a good reset link
 * being told it is broken.
 *
 * No DOM: both branches are pure functions of (code, status), which is why they were extracted from
 * inside `setError`.
 */
import { describe, it, expect } from 'vitest'

import { ACCOUNT_DISABLED_CODE } from '../../src/errors/AccountDisabled'
import { signInErrorMessage } from '../../src/app/(frontend)/login/LoginForm'
import { resetErrorMessage } from '../../src/app/(frontend)/reset-password/ResetPasswordForm'

describe('login — all three outcomes', () => {
  it('a DISABLED account with correct credentials names the reason', () => {
    // 403 + the code. Before the code existed this fell into the verification branch below.
    expect(signInErrorMessage(ACCOUNT_DISABLED_CODE, 403)).toMatch(/disabled/i)
    expect(signInErrorMessage(ACCOUNT_DISABLED_CODE, 403)).toMatch(/administrator/i)
  })

  it('an UNVERIFIED account still gets the verification message', () => {
    // 403 with no code — the original meaning of this status on the login op.
    expect(signInErrorMessage(undefined, 403)).toMatch(/verified/i)
  })

  it('BAD CREDENTIALS still get the generic message', () => {
    // 401. Deliberately generic: it must not reveal whether the address is registered.
    const msg = signInErrorMessage(undefined, 401)
    expect(msg).toMatch(/invalid email or password/i)
    expect(msg).not.toMatch(/disabled|verified/i)
  })

  it('the disabled branch wins over the status branch, not the other way round', () => {
    // Order matters: both conditions are true for a disabled account, and checking status first
    // would silently produce the verification message.
    expect(signInErrorMessage(ACCOUNT_DISABLED_CODE, 403)).not.toMatch(/verified/i)
  })

  it('an unknown code falls back rather than showing something empty', () => {
    expect(signInErrorMessage('SOME_FUTURE_CODE', 401)).toMatch(/invalid email or password/i)
  })
})

describe('reset-password — both outcomes', () => {
  it('a valid token on a DISABLED account names the reason', () => {
    expect(resetErrorMessage(ACCOUNT_DISABLED_CODE)).toMatch(/disabled/i)
  })

  it('an invalid or expired token keeps the generic expiry message', () => {
    // The direction that matters in reverse: a bogus token must NOT learn that any account is
    // disabled, so the absence of the code has to fall through to the generic string.
    const msg = resetErrorMessage(undefined)
    expect(msg).toMatch(/invalid or has expired/i)
    expect(msg).not.toMatch(/disabled/i)
  })
})
