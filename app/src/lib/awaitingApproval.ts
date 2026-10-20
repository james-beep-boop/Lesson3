import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { rowsOf, txDb } from './txDb'

/**
 * How many accounts cannot sign in yet because nobody has verified them — on an email-less site,
 * the Site Administrator's approval queue (Manage → Users → Accounts).
 *
 * A trusted aggregate: a count, no identities, for a caller the dashboard has already established is
 * a Site Administrator. `IS NOT TRUE`, matching the Users search filter: Payload's verify rejects any
 * falsy `_verified`, NULL included.
 */
export async function countAwaitingApproval(req: PayloadRequest): Promise<number> {
  const db = await txDb(req)
  const count = Number(
    rowsOf(
      await db.execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE _verified IS NOT TRUE`),
    )[0]?.count ?? 0,
  )
  return Number.isSafeInteger(count) && count > 0 ? count : 0
}
