/**
 * Make this database another school's — ONLY when a prepared database has been copied to set up
 * ANOTHER school. Never after restoring a school's own backup: that must keep its identity.
 * (docs/OPS.md, "Prepare a machine for another school"; `src/lib/identity/resetIdentity.ts`)
 *
 * Gives the installation a new id and every person, lesson plan, saved version, message and forum
 * post a new worldwide id. Stop the app first; the reset refuses while anything else is connected.
 * Run from the deployment directory through the `migrate` service:
 *
 *   docker compose stop app
 *   docker compose run --rm migrate npx payload run scripts/reset-installation-id.ts
 *   docker compose run --rm -e APPLY=1 migrate npx payload run scripts/reset-installation-id.ts
 *   docker compose up -d
 *
 * The first `run` is read-only and prints what would change. `APPLY=1` changes it.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import {
  RESET_APPLICATION_NAME,
  resetInstallationIdentity,
} from '../src/lib/identity/resetIdentity'

// Name this script's own connections so the sole-client check does not count them. node-postgres
// reads PGAPPNAME whenever it opens a connection, and the pool opens none before getPayload.
process.env.PGAPPNAME = RESET_APPLICATION_NAME

const payload = await getPayload({ config })
const apply = process.env.APPLY === '1'
const report = await resetInstallationIdentity(payload, { apply })
const counts = Object.entries(report.counts)
  .map(([name, n]) => `${name} ${n}`)
  .join(', ')

if (!apply) {
  console.log(`DRY RUN — installation id is ${report.previous ?? '(unreadable)'}.`)
  console.log(`New ids would be given to: ${counts}.`)
  if (report.otherClients) {
    console.log(`${report.otherClients} other connection(s) are open: stop the app before APPLY=1.`)
  }
  console.log('Re-run with APPLY=1 only if this database was copied to set up another school.')
} else {
  console.log(`Installation id replaced: ${report.previous ?? '(none)'} → ${report.current}`)
  console.log(`New ids given to: ${counts}.`)
}
