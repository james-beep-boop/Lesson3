import type { Payload } from 'payload'
import { isEditorFor, toId } from '../../access'
import { releaseMajor } from '../../ingest/releaseAncestry'
import type { LessonBundleVersion, User } from '../../payload-types'
import { relId } from '../relId'
import { compareSemver } from '../semver'

type Source = Pick<LessonBundleVersion, 'id' | 'lessonPlan' | 'subjectGrade' | 'semver'>
export type DraftCombineSuggestion = { id: number; semver: string; kind: 'release' | 'descendant' }

/** Shared-history ingested releases take priority; other suggestions must descend from the source. */
export async function findDraftCombineSuggestion(
  payload: Payload,
  source: Source,
  user: User,
): Promise<DraftCombineSuggestion | null> {
  const planId = relId(source.lessonPlan)
  if (planId === null || !source.semver || !isEditorFor(user, toId(source.subjectGrade)))
    return null
  const { docs } = await payload.find({
    collection: 'lesson-bundle-versions',
    where: { lessonPlan: { equals: planId } },
    select: { semver: true, lineage: true, author: true, mergedFrom: true },
    depth: 0,
    pagination: false,
    overrideAccess: false,
    user,
  })
  const current = docs.find((version) => version.id === source.id)
  if (!current) return null
  const readable = new Set(docs.map((version) => version.id))
  const ancestors = new Set(
    [source.id, ...(current.lineage ?? [])].filter((id) => readable.has(id)),
  )
  let best: DraftCombineSuggestion | null = null
  let bestIsRelease = false
  for (const version of docs) {
    if (
      version.id === source.id ||
      !version.semver ||
      compareSemver(version.semver, source.semver) <= 0 ||
      ![version.id, ...(version.lineage ?? [])].some((id) => ancestors.has(id))
    )
      continue
    const isRelease =
      releaseMajor({
        semver: version.semver,
        author: relId(version.author),
        second: relId(version.mergedFrom),
      }) !== null
    if (!isRelease && !version.lineage?.includes(source.id)) continue
    if (
      !best ||
      (isRelease && !bestIsRelease) ||
      (isRelease === bestIsRelease && compareSemver(version.semver, best.semver) > 0)
    ) {
      best = { id: version.id, semver: version.semver, kind: isRelease ? 'release' : 'descendant' }
      bestIsRelease = isRelease
    }
  }
  return best
}
