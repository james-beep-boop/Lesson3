/**
 * This installation's worldwide id (2026-10-19) — the identity a school machine will have when it
 * joins a school network. Stored on the `system-settings` singleton (`fields/identity.ts`).
 *
 * ⚑ RESTORE KEEPS IT; A COPY MUST NOT. The id lives in the database, so restoring a school's own
 * backup onto a replacement machine keeps the school's identity — which is right. Copying a PREPARED
 * database to set up ANOTHER school would give two schools one identity, so that copy must run
 * `scripts/reset-installation-id.ts` (docs/OPS.md, "Preparing a machine for another school").
 */
import type { Payload } from 'payload'

import { RESET_INSTALLATION_ID_CONTEXT } from '../../fields/identity'

/** The stored id, or null if it cannot be read (never throws — a Manage fact, not a gate). */
export async function readInstallationId(payload: Payload): Promise<string | null> {
  try {
    const doc = (await payload.findGlobal({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: true,
      select: { installationId: true },
    })) as { installationId?: unknown }
    return typeof doc.installationId === 'string' && doc.installationId ? doc.installationId : null
  } catch {
    return null
  }
}

/** Read the current id and, with `apply`, replace it with a new one. Returns both. */
export async function resetInstallationId(
  payload: Payload,
  apply: boolean,
): Promise<{ previous: string | null; current: string | null }> {
  const previous = await readInstallationId(payload)
  if (!apply) return { previous, current: previous }
  await payload.updateGlobal({
    slug: 'system-settings',
    data: {},
    overrideAccess: true,
    context: { [RESET_INSTALLATION_ID_CONTEXT]: true },
  })
  return { previous, current: await readInstallationId(payload) }
}
