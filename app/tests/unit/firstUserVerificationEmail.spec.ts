import { describe, expect, it } from 'vitest'

import { suppressFirstUserVerificationEmail } from '../../src/lib/firstUserBootstrap'

const run = ({
  operation = 'create',
  overrideAccess,
  pathname = '/api/users/first-register',
}: {
  operation?: string
  overrideAccess?: boolean
  pathname?: string
}) => {
  const args = { data: { email: 'first@lesson3.local' } }
  return suppressFirstUserVerificationEmail({
    args,
    operation,
    overrideAccess,
    req: { pathname },
  } as never)
}

describe('first-user verification email suppression', () => {
  it("suppresses the redundant email for Payload's trusted first-register create", () => {
    expect(run({ overrideAccess: true })).toMatchObject({ disableVerificationEmail: true })
  })

  it('does not suppress an ordinary wire signup', () => {
    expect(run({ overrideAccess: false, pathname: '/api/users' })).not.toHaveProperty(
      'disableVerificationEmail',
    )
  })

  it("does not trust the first-register path without Payload's in-process override flag", () => {
    expect(run({ overrideAccess: false })).not.toHaveProperty('disableVerificationEmail')
  })

  it('does not suppress other trusted Local-API creates', () => {
    expect(run({ overrideAccess: true, pathname: '/scripts/seed' })).not.toHaveProperty(
      'disableVerificationEmail',
    )
  })

  it('does not alter non-create operations on the same route', () => {
    expect(run({ operation: 'update', overrideAccess: true })).not.toHaveProperty(
      'disableVerificationEmail',
    )
  })
})
