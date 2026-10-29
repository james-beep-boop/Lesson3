/**
 * `refuseBlankPassword` (audit F-C23-001). Payload 3.92 stores an all-space password — its
 * validator checks only emptiness — but its login refuses `password.trim() === ''` before comparing,
 * so such an account could never sign in. Refuse it wherever a password is SET.
 */
import { describe, expect, it } from 'vitest'
import { ValidationError } from 'payload'

import { refuseBlankPassword } from '../../src/hooks/blankPassword'

const run = (operation: string, password: unknown) =>
  refuseBlankPassword({ args: { data: { password } }, operation } as never)

describe('all-space passwords are refused where they are set', () => {
  it.each(['create', 'update', 'resetPassword'])('%s: refuses eight spaces', (operation) => {
    expect(() => run(operation, '        ')).toThrow(ValidationError)
  })

  it.each(['create', 'update', 'resetPassword'])(
    '%s: accepts an ordinary password',
    (operation) => {
      expect(run(operation, 'correct horse')).toEqual({ data: { password: 'correct horse' } })
    },
  )

  it('leaves an absent or empty password to Payload (an update without one changes nothing)', () => {
    expect(() => run('update', undefined)).not.toThrow()
    expect(() => run('create', '')).not.toThrow()
  })

  it('does not interfere with login, which has its own blank check', () => {
    expect(() => run('login', '        ')).not.toThrow()
  })
})
