import {
  APIError,
  ValidationError,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
  type PayloadRequest,
} from 'payload'

import { relId } from '../lib/relId'
import { lockRows } from '../lib/txDb'
import { planSeries, type VersionSeries } from '../lib/versionSeries'

const pointerError = (series: VersionSeries, message: string, req: PayloadRequest) =>
  new ValidationError(
    { collection: series.parent, errors: [{ message, path: 'officialVersion' }] },
    req.t,
  )

export async function isOfficialVersion(
  req: PayloadRequest,
  parentId: number,
  versionId: number | string,
  series: VersionSeries = planSeries,
): Promise<boolean> {
  const parent = await req.payload.findByID({
    collection: series.parent,
    id: parentId,
    depth: 0,
    select: { officialVersion: true },
    overrideAccess: true,
    req,
  })
  return relId(parent.officialVersion) === relId(versionId)
}

export function guardOfficialDeletion(series: VersionSeries): CollectionBeforeDeleteHook {
  return async ({ id, req }) => {
    const version = (await req.payload.findByID({
      collection: series.versions,
      id,
      depth: 0,
      select: { [series.parentKey]: true },
      overrideAccess: true,
      req,
    })) as unknown as Record<string, unknown>
    const parentId = relId(version[series.parentKey])
    if (parentId == null) return
    const deleting = req.context[series.parent] as Set<string> | undefined
    if (deleting?.has(String(parentId))) return

    // A plain read can see an old pointer during a concurrent promotion. Wait for that parent row
    // before reading it so a concurrent delete cannot clear the newly set pointer via the FK.
    await lockRows(req, series.table, [parentId])
    if (await isOfficialVersion(req, parentId, id, series)) {
      throw new APIError(
        'This version is Official and cannot be deleted. Make another version Official first.',
        409,
      )
    }
  }
}

/** Role scope is checked against the version's grade, which must agree with its parent. */
export function guardVersionSubjectGrade(series: VersionSeries): CollectionBeforeValidateHook {
  return async ({ data, originalDoc, req }) => {
    if (!data) return data
    const parentId = relId(data[series.parentKey] ?? originalDoc?.[series.parentKey])
    const grade = relId(data.subjectGrade ?? originalDoc?.subjectGrade)
    // Required-field validation handles an omitted relationship.
    if (parentId == null || grade == null) return data

    const parent = await req.payload.findByID({
      collection: series.parent,
      id: parentId,
      depth: 0,
      select: { subjectGrade: true },
      overrideAccess: true,
      req,
    })
    const parentGrade = relId(parent.subjectGrade)
    if (parentGrade != null && parentGrade !== grade) {
      throw new ValidationError(
        {
          collection: series.versions,
          errors: [
            {
              message: `Version subject-grade must match its ${series.label}.`,
              path: 'subjectGrade',
            },
          ],
        },
        req.t,
      )
    }
    return data
  }
}

/** Keep one Official version and ensure it belongs to this parent, even on partial updates. */
export function guardOfficialPointer(series: VersionSeries): CollectionBeforeValidateHook {
  return async ({ data, operation, originalDoc, req }) => {
    if (!data || !('officialVersion' in data || 'subjectGrade' in data)) return data
    // System teardown can explicitly clear a pointer. Ingest sets it after creating the snapshot.
    if (
      operation === 'update' &&
      req.user &&
      'officialVersion' in data &&
      !relId(data.officialVersion)
    ) {
      throw pointerError(
        series,
        `A ${series.label} must keep one Official version; the pointer cannot be cleared.`,
        req,
      )
    }
    if (operation === 'create' && req.user && data.officialVersion) {
      throw pointerError(
        series,
        `A new ${series.label} cannot set an Official version on create; create a version under it first.`,
        req,
      )
    }

    const ref = 'officialVersion' in data ? data.officialVersion : originalDoc?.officialVersion
    if (!ref) return data
    const id = relId(ref)
    if (!id) throw pointerError(series, 'Official version must reference a saved version.', req)

    // The parent's UPDATE locks its row. The delete guard must lock its read explicitly.
    const version = (await req.payload.findByID({
      collection: series.versions,
      id,
      depth: 0,
      select: { [series.parentKey]: true, subjectGrade: true },
      overrideAccess: true,
      req,
    })) as unknown as Record<string, unknown>
    const parentId = relId(originalDoc?.id)
    if (parentId && relId(version[series.parentKey]) !== parentId) {
      throw pointerError(series, `Official version must belong to this ${series.label}.`, req)
    }
    const grade = relId(data.subjectGrade ?? originalDoc?.subjectGrade)
    if (grade && relId(version.subjectGrade) !== grade) {
      throw pointerError(
        series,
        `Official version must match this ${series.label} subject-grade.`,
        req,
      )
    }
    return data
  }
}

/** Delete the snapshots within the parent deletion's transaction. */
export async function deleteSeriesVersions(
  req: PayloadRequest,
  series: VersionSeries,
  parentId: number | string,
): Promise<void> {
  const ids = (req.context[series.parent] as Set<string> | undefined) ?? new Set<string>()
  ids.add(String(parentId))
  req.context[series.parent] = ids

  const result = await req.payload.delete({
    collection: series.versions,
    where: { [series.parentKey]: { equals: parentId } },
    overrideAccess: true,
    req,
  })
  if (result.errors.length) throw new APIError('Could not remove the saved versions.', 500)
}
