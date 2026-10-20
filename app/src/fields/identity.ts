/**
 * Worldwide identity fields (2026-10-19) — insurance for a future school network, invisible today.
 *
 * Local serial ids mean nothing on another machine. These give every version, lesson plan and user a
 * UUID that does, every ARES-uploaded version a content fingerprint two schools would agree on, and
 * each installation its own UUID. Ancestry (`sourceVersion`, `mergedFrom`, `lineage`) still uses
 * local ids; converting it is later work. See `docs/DECISIONS.md` 2026-10-19.
 *
 * ⚑ GENERATED IN A FIELD `beforeChange` HOOK, NOT A DEFAULT. Payload deletes a field the caller may
 * not write and then applies its default (`fields/hooks/beforeValidate/promise.js`), but trusted
 * writers (`overrideAccess: true` — ingest, save-as-new) skip field access entirely, so a default
 * would accept whatever they pass. Field `beforeChange` hooks run after access and before validation
 * (`fields/hooks/beforeChange/promise.js`), for every caller: a create always gets a fresh value, an
 * update always keeps the stored one. No API, form or trusted copy can choose or change these ids.
 */
import { randomUUID } from 'node:crypto'

import type { FieldAccess, TextField } from 'payload'

import { systemOnly } from '../access/bundle'

/**
 * UNIQUE here and NOT NULL in the database (the migration). Deliberately not `required` in Payload:
 * its generated create types require every `required` field from every caller, and the hook — not
 * the caller — supplies this one. The database constraint is what guarantees no row is ever without
 * an id; `tests/http/worldwideIds.http.spec.ts` proves it on the migrated schema.
 */
export const worldwideIdField = (read?: FieldAccess): TextField => ({
  name: 'uid',
  type: 'text',
  unique: true,
  access: { create: systemOnly, update: systemOnly, ...(read ? { read } : {}) },
  admin: { hidden: true, readOnly: true },
  hooks: {
    beforeChange: [
      ({ operation, previousValue }) =>
        operation === 'create' || typeof previousValue !== 'string' || !previousValue
          ? randomUUID()
          : previousValue,
    ],
  },
})

/** `req.context` key through which ingest — and only ingest — hands a new version its fingerprint. */
export const RELEASE_FINGERPRINT_CONTEXT = 'aresReleaseFingerprint'

/**
 * `ares-content-v1:sha256:…` on versions created from an ARES upload; null on every other version.
 * Set on create only from `req.context[RELEASE_FINGERPRINT_CONTEXT]`, which ingest alone supplies — so
 * a teacher's save, which copies a release's content, can never inherit the release's fingerprint.
 */
export const releaseFingerprintField: TextField = {
  name: 'releaseFingerprint',
  type: 'text',
  index: true,
  access: { create: systemOnly, update: systemOnly },
  admin: { hidden: true, readOnly: true },
  hooks: {
    beforeChange: [
      ({ operation, previousValue, req }) => {
        if (operation !== 'create') return previousValue ?? null
        const supplied = req.context?.[RELEASE_FINGERPRINT_CONTEXT]
        return typeof supplied === 'string' ? supplied : null
      },
    ],
  },
}

/** `req.context` key that lets `scripts/reset-installation-id.ts` mint a new installation id. */
export const RESET_INSTALLATION_ID_CONTEXT = 'resetInstallationId'

/**
 * This installation's worldwide id, on the `system-settings` singleton. Created by the migration;
 * kept by every save; replaced only by the reset script — run when a prepared database is copied to
 * another school. A restore of THIS school's backup keeps it, which is the point (OPS.md).
 */
export const installationIdField: TextField = {
  name: 'installationId',
  type: 'text',
  access: { create: systemOnly, update: systemOnly },
  admin: { hidden: true, readOnly: true },
  hooks: {
    beforeChange: [
      ({ previousValue, req }) =>
        req.context?.[RESET_INSTALLATION_ID_CONTEXT] === true ||
        typeof previousValue !== 'string' ||
        !previousValue
          ? randomUUID()
          : previousValue,
    ],
  },
}
