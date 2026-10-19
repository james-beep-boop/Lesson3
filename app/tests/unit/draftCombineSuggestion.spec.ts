import { expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { findDraftCombineSuggestion } from '../../src/lib/editRecovery/draftCombineSuggestion'
import type { LessonBundleVersion, User } from '../../src/payload-types'

const user = { id: 1, roles: ['siteAdmin'] } as User
const source = { id: 2, lessonPlan: 7, subjectGrade: 5, semver: '1.0.1' } as LessonBundleVersion
const root = { id: 1, semver: '1.0.0', lineage: [] }
const teacher = { id: 2, semver: '1.0.1', lineage: [1], author: 1 }
const release = { id: 3, semver: '2.0.0', lineage: [1] }
const suggest = (docs: unknown[], from = source) =>
  findDraftCombineSuggestion(
    { find: vi.fn().mockResolvedValue({ docs }) } as unknown as Payload,
    from,
    user,
  )

it('offers a new ARES release sharing an ancestor with teacher 1.0.1, without claiming descent', async () => {
  expect(await suggest([root, teacher, release])).toEqual({
    id: 3,
    semver: '2.0.0',
    kind: 'release',
  })
})
it('prefers the highest numeric newer release to an even newer teacher patch', async () => {
  expect(
    await suggest([
      root,
      teacher,
      release,
      { id: 4, semver: '10.0.0', lineage: [1] },
      { id: 5, semver: '9.0.0', lineage: [1] },
      { id: 6, semver: '10.0.9', lineage: [1], author: 1 },
    ]),
  ).toEqual({ id: 4, semver: '10.0.0', kind: 'release' })
})
it('ignores a newer sibling teacher version and suggests only a source descendant', async () => {
  expect(
    await suggest([
      root,
      teacher,
      { id: 3, semver: '1.0.9', lineage: [2, 1], author: 1 },
      { id: 4, semver: '1.0.10', lineage: [1], author: 1 },
    ]),
  ).toEqual({ id: 3, semver: '1.0.9', kind: 'descendant' })
})
it('does not suggest a sibling teacher version when no release or descendant exists', async () => {
  expect(
    await suggest([root, teacher, { id: 4, semver: '1.0.10', lineage: [1], author: 1 }]),
  ).toBeNull()
})
it('does not mistake an authored or combined whole major for an ingested release', async () => {
  expect(
    await suggest([
      root,
      teacher,
      { id: 3, semver: '2.0.0', lineage: [1], author: 1 },
      { id: 4, semver: '3.0.0', lineage: [1], mergedFrom: 2 },
      { id: 5, semver: '3.0.1', lineage: [1], author: 1 },
    ]),
  ).toBeNull()
})
it('ignores unrelated versions and history whose only shared ancestor is unavailable', async () => {
  expect(await suggest([teacher, release, { id: 4, semver: '9.0.0', lineage: [] }])).toBeNull()
  expect(await suggest([root, teacher, { id: 4, semver: '9.0.0', lineage: [] }])).toBeNull()
})
it('never suggests an older version or the source itself', async () => {
  expect(await suggest([root, teacher, release], { ...source, id: 3, semver: '2.0.0' })).toBeNull()
})
it('does not advise when the source is unavailable', async () => {
  expect(await suggest([root, release])).toBeNull()
})
it('does not query history for a caller without editing access', async () => {
  const find = vi.fn()
  expect(
    await findDraftCombineSuggestion({ find } as unknown as Payload, source, {
      id: 1,
      roles: [],
      assignments: [],
    } as unknown as User),
  ).toBeNull()
  expect(find).not.toHaveBeenCalled()
})
