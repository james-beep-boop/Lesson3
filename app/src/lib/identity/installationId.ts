/**
 * This installation's worldwide id (2026-10-19) — the identity a school machine will have when it
 * joins a school network. Stored on the `system-settings` singleton (`fields/identity.ts`).
 *
 * ⚑ RESTORE KEEPS IT; A COPY MUST NOT. The id lives in the database, so restoring a school's own
 * backup onto a replacement machine keeps the school's identity — which is right. Copying a PREPARED
 * database to set up ANOTHER school would give two schools one identity, so that copy must run
 * `scripts/reset-installation-id.ts` (`./resetIdentity.ts`; docs/OPS.md, "Prepare a machine for another school").
 */
import type { Payload, PayloadRequest } from 'payload'

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

/**
 * The id for STAMPING a new record (`originInstallation`, ancestry local keys; 2026-10-29). Unlike
 * `readInstallationId` it reads inside the caller's request — so inside its transaction — and THROWS
 * when the id cannot be read: a record must never be created with a guessed or missing origin.
 */
export async function requireInstallationId(req: PayloadRequest): Promise<string> {
  const doc = (await req.payload.findGlobal({
    slug: 'system-settings',
    depth: 0,
    overrideAccess: true,
    select: { installationId: true },
    req,
  })) as { installationId?: unknown }
  if (typeof doc.installationId === 'string' && doc.installationId) return doc.installationId
  throw new Error('This installation has no Installation ID, so the record cannot be created.')
}

/**
 * DEV/TEST `push` databases only: give the settings singleton its id at boot. In production the
 * `worldwide_ids` migration creates the row with a NOT NULL id, and this never runs — a missing id
 * there is a fault `requireInstallationId` reports, not something to paper over with a new identity.
 * Boot is single-threaded, so this cannot race a second boot's create.
 */
export async function ensureInstallationIdForPush(payload: Payload): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (await readInstallationId(payload)) return
  await payload.updateGlobal({ slug: 'system-settings', data: {}, overrideAccess: true })
}
