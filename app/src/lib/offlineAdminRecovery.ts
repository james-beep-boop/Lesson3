import type { Payload } from 'payload'

import { OPERATOR_RESET_LINK_CONTEXT } from '../hooks/authRateLimit'
import type { User } from '../payload-types'
import { emailLinkBase } from './emailLinkBase'

export interface OfflineAdminRecoveryResult {
  email: string
  link: string | null
  name: string
}

/**
 * Validate an existing Site Administrator and, when requested, mint a hand-delivered reset link.
 * This does not create users, grant roles, enable accounts, or bypass email verification. Those
 * constraints keep shell recovery narrower than editing a user row directly in Postgres.
 */
export async function recoverOfflineSiteAdmin(
  payload: Payload,
  requestedEmail: string | undefined,
  apply: boolean,
): Promise<OfflineAdminRecoveryResult> {
  const email = requestedEmail?.trim().toLowerCase()
  if (!email) throw new Error('RECOVERY_EMAIL is required.')

  const found = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    showHiddenFields: true,
  })
  if (found.docs.length === 0) throw new Error(`No account exists for ${email}.`)
  if (found.docs.length !== 1) throw new Error(`More than one account exists for ${email}.`)

  const user = found.docs[0] as User
  if (!user.roles?.includes('siteAdmin')) {
    throw new Error(`${email} is not a Site Administrator; recovery cannot grant that role.`)
  }
  if (user._verified !== true) {
    throw new Error(`${email} is not verified; recovery cannot change verification state.`)
  }
  if (user.signInDisabled) {
    throw new Error(`${email} has sign-in disabled; recovery cannot re-enable the account.`)
  }

  if (!apply) return { email, name: user.name, link: null }

  const base = emailLinkBase()
  if (!base) {
    throw new Error('ADMIN_URL or SERVER_URL is required to build a usable reset link.')
  }

  const token = await payload.forgotPassword({
    collection: 'users',
    data: { email },
    disableEmail: true,
    overrideAccess: true,
    context: { [OPERATOR_RESET_LINK_CONTEXT]: true },
  })
  if (!token) throw new Error(`Could not generate a reset link for ${email}.`)

  return {
    email,
    name: user.name,
    link: `${base}/reset-password?token=${token}`,
  }
}
