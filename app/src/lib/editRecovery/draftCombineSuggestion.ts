import type { Payload } from 'payload'
import { isEditorFor, toId } from '../../access'
import type { LessonBundleVersion, User } from '../../payload-types'
import { relId } from '../relId'
import { compareSemver } from '../semver'

type Source = Pick<LessonBundleVersion, 'id' | 'lessonPlan' | 'subjectGrade' | 'semver'>
export type DraftCombineSuggestion = { id: number; semver: string }

/** Optional guidance only. A retained lineage id proves descent even in a bounded history window. */
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
    where: { and: [{ lessonPlan: { equals: planId } }, { lineage: { equals: source.id } }] },
    select: { semver: true },
    depth: 0,
    pagination: false,
    overrideAccess: false,
    user,
  })
  return docs.reduce<DraftCombineSuggestion | null>((best, version) => {
    if (
      version.id === source.id ||
      !version.semver ||
      compareSemver(version.semver, source.semver!) <= 0
    )
      return best
    return !best || compareSemver(version.semver, best.semver) > 0
      ? { id: version.id, semver: version.semver }
      : best
  }, null)
}
