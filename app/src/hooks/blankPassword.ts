import type { CollectionBeforeOperationHook } from 'payload'
import { ValidationError } from 'payload'

/**
 * Refuse an all-whitespace password wherever one can be SET (signup/create, update, reset).
 *
 * Payload 3.92's own rules disagree with themselves: its `password` validator only checks
 * emptiness, so `'        '` is hashed and stored, but its login operation rejects
 * `password.trim() === ''` before ever comparing — the account could never sign in with the
 * password it was given (audit F-C23-001). Refusing at the point of setting is the side that keeps
 * login's blank check meaningful.
 */
export const refuseBlankPassword: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== 'create' && operation !== 'update' && operation !== 'resetPassword') return args
  const password = (args as { data?: { password?: unknown } }).data?.password
  if (typeof password === 'string' && password !== '' && !password.trim()) {
    throw new ValidationError({
      collection: 'users',
      errors: [{ message: 'A password cannot be only spaces.', path: 'password' }],
    })
  }
  return args
}
