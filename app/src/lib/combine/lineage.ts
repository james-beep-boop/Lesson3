import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { relId } from '../relId'

export const MAX_LINEAGE = 2000

/** Recent ancestry without foreign keys. Serial ids order creation, including deleted versions. */
export function unionLineage(parents: { id: number; lineage?: number[] | null }[]): number[] {
  const ids = [...new Set(parents.flatMap((p) => [p.id, ...(p.lineage ?? [])]))]
  // A bounded history must never make the plan unsaveable. A full window is treated as
  // incomplete by ancestor lookup, so trimming cannot silently select an older merge base.
  return ids.sort((a, b) => a - b).slice(-MAX_LINEAGE)
}

/** All creation paths, including trusted ingest and Local API, stamp rather than copy ancestry. */
export const stampVersionLineage: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const ids = [relId(data.sourceVersion), relId(data.mergedFrom)].filter(
    (id): id is number => id !== null,
  )
  const parents = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      const parent = await req.payload.findByID({
        collection: 'lesson-bundle-versions',
        id,
        depth: 0,
        select: { lessonPlan: true, lineage: true },
        overrideAccess: true,
        req,
      })
      if (relId(parent.lessonPlan) !== relId(data.lessonPlan)) {
        throw new APIError('Both versions must belong to the same lesson plan.', 400)
      }
      return parent
    }),
  )
  return { ...data, lineage: unionLineage(parents) }
}
