/**
 * Break-glass password recovery for a no-email deployment.
 *
 * Run from the deployment directory through the `migrate` service; the production `app` image has
 * neither the Payload CLI nor this source file:
 *
 *   docker compose run --rm -e RECOVERY_EMAIL=admin@example.com \
 *     migrate npx payload run scripts/recover-site-admin.ts
 *   docker compose run --rm -e APPLY=1 -e RECOVERY_EMAIL=admin@example.com \
 *     migrate npx payload run scripts/recover-site-admin.ts
 *
 * The first command is read-only. `APPLY=1` mints a one-hour, single-use reset link and prints it to
 * the invoking terminal. Treat that output as a live credential: do not redirect it to a file, paste
 * it into a ticket, or leave the terminal visible. The tool deliberately cannot create an account,
 * grant Site Administrator, verify an address, or re-enable sign-in.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { recoverOfflineSiteAdmin } from '../src/lib/offlineAdminRecovery'

const payload = await getPayload({ config })
const apply = process.env.APPLY === '1'
const result = await recoverOfflineSiteAdmin(payload, process.env.RECOVERY_EMAIL, apply)

if (!apply) {
  console.log(
    `DRY RUN — ${result.name} <${result.email}> is eligible for recovery. Re-run with APPLY=1 to mint a reset link.`,
  )
} else {
  console.log(`Password reset link for ${result.name} <${result.email}> (expires in 60 minutes):`)
  console.log(result.link)
}
