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

import type { FieldAccess, FieldHook, TextField } from 'payload'

import { systemOnly } from '../access/bundle'
import { MAX_LINEAGE } from '../lib/combine/lineage'
import { requireInstallationId } from '../lib/identity/installationId'

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

/**
 * The installation that CREATED this record (2026-10-29), stamped on create from this machine's id
 * and kept by every update. A record synced in from another school will carry that school's value —
 * written by the future sync code, not here. Only `scripts/reset-installation-id.ts` rewrites it, in
 * SQL, when a copied database becomes another school.
 */
export const originInstallationField = (read?: FieldAccess): TextField => ({
  name: 'originInstallation',
  type: 'text',
  index: true,
  access: { create: systemOnly, update: systemOnly, ...(read ? { read } : {}) },
  admin: { hidden: true, readOnly: true },
  hooks: {
    beforeChange: [
      async ({ operation, previousValue, req }) =>
        operation === 'create' ? requireInstallationId(req) : previousValue,
    ],
  },
})

/** Ancestry keys are stamped on create by `stampVersionLineage`; no update, trusted or not, moves them. */
const keepOnUpdate: FieldHook = ({ operation, previousValue, value }) =>
  operation === 'create' ? value : previousValue

/**
 * Worldwide ancestry of a version (2026-10-29; `lib/identity/ancestorKey.ts`). Plain text, NOT foreign
 * keys: deleting a parent leaves them intact, which is the point. `lineageKeys` is aligned
 * index-for-index with the numeric `lineage`.
 */
const ancestryKey = (name: string) =>
  ({
    name,
    type: 'text',
    access: { create: systemOnly, update: systemOnly },
    admin: { hidden: true, readOnly: true },
    hooks: { beforeChange: [keepOnUpdate] },
  }) satisfies TextField

export const ancestryKeyFields: TextField[] = [
  ancestryKey('sourceVersionKey'),
  ancestryKey('mergedFromKey'),
  { ...ancestryKey('lineageKeys'), hasMany: true, maxRows: MAX_LINEAGE },
]

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
      // The copy reset (`lib/identity/resetIdentity.ts`) replaces it in SQL, with every other identity.
      ({ previousValue }) =>
        typeof previousValue !== 'string' || !previousValue ? randomUUID() : previousValue,
    ],
  },
}

/** Ingest-only release metadata, immune to copied or forged data, like the fingerprint. */
export const ARES_RELEASE_CONTEXT = 'aresLessonRelease'
export const aresReleaseField = (name: 'aresReleaseId' | 'aresReleaseDate'): TextField => ({
  name,
  type: 'text',
  ...(name === 'aresReleaseId' ? { index: true } : {}),
  access: { create: systemOnly, update: systemOnly },
  admin: { hidden: true, readOnly: true },
  hooks: {
    beforeChange: [
      ({ operation, previousValue, req }) => {
        if (operation !== 'create') return previousValue ?? null
        const release = req.context?.[ARES_RELEASE_CONTEXT] as
          { id?: string; date?: string } | undefined
        return release?.[name === 'aresReleaseId' ? 'id' : 'date'] ?? null
      },
    ],
  },
})
