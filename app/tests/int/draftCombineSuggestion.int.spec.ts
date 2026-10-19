import { afterAll, beforeAll, expect, it } from 'vitest'
import { findDraftCombineSuggestion } from '../../src/lib/editRecovery/draftCombineSuggestion'
import { MARK, minimalBundleContent, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
let fx: RoleFixture
beforeAll(async () => {
  fx = await setupRoleFixture()
}, 120_000)
afterAll(async () => {
  await fx?.teardown()
})
it('offers a related ARES release for teacher 1.0.1, preferring it to newer teacher work', async () => {
  const make = (semver: string, sourceVersion: number | null, ingested = false) =>
    fx.payload.create({
      collection: 'lesson-bundle-versions',
      overrideAccess: true,
      data: {
        ...minimalBundleContent(),
        title: `${MARK}suggestion`,
        lessonPlan: fx.plan.id,
        subjectGrade: fx.subjectGrade.id,
        semver,
        sourceVersion,
        ...(ingested ? {} : { author: fx.users.editor.id }),
      } as never,
    })
  const source = await make('1.0.1', fx.version.id)
  const descendant = await make('1.0.9', source.id)
  const newestTeacher = await make('2.0.9', fx.version.id)
  const release = await make('2.0.0', fx.version.id, true)
  await make('3.0.0', null, true) // Unrelated upload history cannot supply advice.
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.editor)).toEqual({
    id: release.id,
    semver: '2.0.0',
    kind: 'release',
  })
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.teacher)).toBeNull()
  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: release.id,
    overrideAccess: true,
  })
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.editor)).toEqual({
    id: descendant.id,
    semver: '1.0.9',
    kind: 'descendant',
  })
  await fx.payload.delete({
    collection: 'lesson-bundle-versions',
    id: descendant.id,
    overrideAccess: true,
  })
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.editor)).toBeNull()
  expect(await findDraftCombineSuggestion(fx.payload, newestTeacher, fx.users.editor)).toBeNull()
})
