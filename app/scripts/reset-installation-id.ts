/**
 * Give this installation a new worldwide id — ONLY when a prepared database has been copied to set up
 * ANOTHER school. Never after restoring a school's own backup: that must keep its id. (docs/OPS.md)
 *
 * Run from the deployment directory through the `migrate` service:
 *
 *   docker compose run --rm migrate npx payload run scripts/reset-installation-id.ts
 *   docker compose run --rm -e APPLY=1 migrate npx payload run scripts/reset-installation-id.ts
 *
 * The first command is read-only and prints the current id. `APPLY=1` replaces it.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { resetInstallationId } from '../src/lib/identity/installationId'

const payload = await getPayload({ config })
const apply = process.env.APPLY === '1'
const { previous, current } = await resetInstallationId(payload, apply)

if (!apply) {
  console.log(`DRY RUN — installation id is ${previous ?? '(unreadable)'}.`)
  console.log('Re-run with APPLY=1 only if this database was copied to set up another school.')
} else {
  console.log(`Installation id replaced: ${previous ?? '(none)'} → ${current ?? '(unreadable)'}`)
}
