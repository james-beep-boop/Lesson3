import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { relId } from '../relId'
import { ancestorKey, localAncestorKey } from '../identity/ancestorKey'
import { requireInstallationId } from '../identity/installationId'

export const MAX_LINEAGE = 2000

/** Recent ancestry without foreign keys. Serial ids order creation, including deleted versions. */
export function unionLineage(parents: { id: number; lineage?: number[] | null }[]): number[] {
  const ids = [...new Set(parents.flatMap((p) => [p.id, ...(p.lineage ?? [])]))]
  // A bounded history must never make the plan unsaveable. A full window is treated as
  // incomplete by ancestor lookup, so trimming cannot silently select an older merge base.
  return ids.sort((a, b) => a - b).slice(-MAX_LINEAGE)
}

export interface KeyedParent {
  id: number
  key: string
  lineage?: number[] | null
  lineageKeys?: string[] | null
}

/**
 * Worldwide keys ALIGNED with `unionLineage` (2026-10-29): `lineageKeys[i]` names the ancestor whose
 * local serial is `lineage[i]`. Keys carry no order, so the numeric union decides order and cap and the
 * keys follow it; a deleted ancestor keeps its key because it travels in the parents' arrays. Keys are
 * never deduplicated on their own — two local release rows may share one fingerprint — only the
 * serials are. A parent whose arrays are not aligned contributes no keys; a serial no parent can name
 * is left `undefined` for the caller to give a local key.
 */
export function unionLineageKeys(parents: KeyedParent[]): {
  lineage: number[]
  lineageKeys: (string | undefined)[]
} {
  const keyOf = new Map<number, string>()
  for (const parent of parents) {
    if (!keyOf.has(parent.id)) keyOf.set(parent.id, parent.key)
    const serials = parent.lineage ?? []
    const keys = parent.lineageKeys ?? []
    if (keys.length !== serials.length) continue
    serials.forEach((serial, i) => {
      if (!keyOf.has(serial)) keyOf.set(serial, keys[i])
    })
  }
  const lineage = unionLineage(parents)
  return { lineage, lineageKeys: lineage.map((serial) => keyOf.get(serial)) }
}

/** All creation paths, including trusted ingest and Local API, stamp rather than copy ancestry —
 *  local serials and, aligned with them, worldwide keys (`lib/identity/ancestorKey.ts`). */
export const stampVersionLineage: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const sourceId = relId(data.sourceVersion)
  const secondId = relId(data.mergedFrom)
  const ids = [sourceId, secondId].filter((id): id is number => id !== null)
  const parents = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const parent = await req.payload.findByID({
        collection: 'lesson-bundle-versions',
        id,
        depth: 0,
        select: {
          lessonPlan: true,
          lineage: true,
          lineageKeys: true,
          uid: true,
          releaseFingerprint: true,
        },
        overrideAccess: true,
        req,
      })
      if (relId(parent.lessonPlan) !== relId(data.lessonPlan)) {
        throw new APIError('Both versions must belong to the same lesson plan.', 400)
      }
      return { ...parent, id, key: ancestorKey(parent) }
    }),
  )
  const { lineage, lineageKeys } = unionLineageKeys(parents)
  // Only an ancestor no parent can name (never in practice after the backfill) needs the id.
  const installationId = lineageKeys.includes(undefined) ? await requireInstallationId(req) : ''
  const keyFor = (id: number | null) => parents.find((p) => p.id === id)?.key ?? null
  return {
    ...data,
    lineage,
    lineageKeys: lineageKeys.map((key, i) => key ?? localAncestorKey(installationId, lineage[i])),
    sourceVersionKey: keyFor(sourceId),
    mergedFromKey: keyFor(secondId),
  }
}
