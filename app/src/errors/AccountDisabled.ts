import { APIError } from 'payload'

/**
 * "This account's sign-in is disabled" — thrown by the `beforeLogin` hook on `users` (D13a step 2).
 *
 * ⚑ THIS EXISTS BECAUSE THE STATUS CODE CANNOT CARRY THE DISTINCTION. Two different failures on the
 * reset path are both **HTTP 403**: an invalid or expired token throws
 * `APIError('Token is either invalid or has expired.', FORBIDDEN)`
 * (`auth/operations/resetPassword.js:53`), and a refusal from `beforeLogin` is 403 too. A client that
 * branched on status would show the wrong message for one of them, and matching translated message
 * TEXT is brittle — it breaks silently on any locale change or upstream copy edit, in the direction
 * of showing the wrong thing. So the refusal carries a stable machine-readable code instead.
 *
 * ⚑ AND IT CANNOT BE A PLAIN `Forbidden`. Payload's `formatErrors` emits the
 * `{ name, data, message }` shape ONLY when the thrown error is an `APIError`/`ValidationError`
 * **and `incoming.data` is truthy** (`utilities/formatErrors.js`); otherwise it falls through to a
 * bare `{ message }` and the code is simply gone from the response. `Forbidden` carries no `data`,
 * so it degrades exactly that way. A subclass that always sets `data` is what makes the contract
 * survive serialisation.
 *
 * The wire contract, which is what `tests/unit/accountDisabledContract.spec.ts` pins — not the
 * rendered string:
 *
 * ```
 * HTTP 403
 * { "errors": [ { "name": "...", "data": { "code": "ACCOUNT_DISABLED" }, "message": "..." } ] }
 * ```
 *
 * Both consumers key on `errors[0].data.code === ACCOUNT_DISABLED_CODE`. There are exactly two, and
 * enumerating them is the point: `beforeLogin` runs in **`login` AND `resetPassword`**
 * (`auth/operations/resetPassword.js:113`), so `LoginForm` and `ResetPasswordForm` both need the
 * branch. Missing the second is the mistake review round 6 caught in the plan.
 */

/**
 * The machine-readable code. Exported as a constant so the thrower and both readers share one
 * spelling — a string literal repeated in three files is three chances to typo it into a branch that
 * silently never matches.
 */
export const ACCOUNT_DISABLED_CODE = 'ACCOUNT_DISABLED' as const

export type AccountDisabledData = { code: typeof ACCOUNT_DISABLED_CODE }

export class AccountDisabledError extends APIError<AccountDisabledData> {
  constructor(
    // Default copy names the reason and the next step. It is still not what the client branches on.
    message = 'This account is disabled — contact an administrator.',
  ) {
    // `isPublic: true` — this message is meant for the person who typed the password, and it is not
    // an oracle: reaching it requires either correct credentials or a valid reset token for THIS
    // account, so the reader is the account's owner. See D13a step 4.
    super(message, 403, { code: ACCOUNT_DISABLED_CODE }, true)
  }
}
