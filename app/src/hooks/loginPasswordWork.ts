import { pbkdf2 } from 'node:crypto'
import { promisify } from 'node:util'
import type { CollectionBeforeOperationHook } from 'payload'

const derive = promisify(pbkdf2)
// Dummy work only: the real credential comparison remains entirely inside Payload's verifier.
// Both supported Payload 3.92.0 formats are performed for every well-formed login; tests pin these
// parameters against installed source so an upstream change cannot silently reopen the timing gap.
const dummyCurrent = (password: string) =>
  derive(password, 'lesson3-dummy-salt', 600_000, 32, 'sha256')
const dummyLegacy = (password: string) =>
  derive(password, 'lesson3-dummy-salt', 25_000, 512, 'sha256')

export const equalizeLoginPasswordWork: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== 'login') return args
  const data = (args as { data?: { email?: unknown; password?: unknown } }).data
  if (typeof data?.email !== 'string' || typeof data.password !== 'string' || !data.password.trim())
    return args
  const user = (await req.payload.db.findOne({
    collection: 'users',
    req,
    where: { email: { equals: data.email.trim().toLowerCase() } },
  })) as {
    id: number | string
    hash?: string
    salt?: string
    lockUntil?: string | null
    loginAttempts?: number | null
  } | null
  const hash = user?.hash
  const current = typeof hash === 'string' && hash.startsWith('pbkdf2-sha256-v1:')
  if (!user || typeof hash !== 'string' || typeof user.salt !== 'string') {
    await dummyLegacy(data.password)
    await dummyCurrent(data.password)
  } else {
    await (current ? dummyLegacy(data.password) : dummyCurrent(data.password))
    // A pre-upgrade lock must not survive the removal of account-wide lockout. Keep the legacy
    // fields in the model/schema for backup compatibility, but never create a new account lock.
    if (user.lockUntil || user.loginAttempts) {
      await req.payload.db.updateOne({
        collection: 'users',
        id: user.id,
        data: { lockUntil: null, loginAttempts: 0 },
        req,
      })
    }
  }
  return args
}
