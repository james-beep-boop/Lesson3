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
it('selects the highest numeric newer descendant, excluding a higher-numbered sibling', async () => {
  const make = (semver: string, sourceVersion: number) =>
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
      } as never,
    })
  const source = await make('2.1.0', fx.version.id)
  await make('2.99.0', fx.version.id)
  await make('1.0.1', source.id)
  await make('2.9.0', source.id)
  const newest = await make('2.10.0', source.id)
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.editor)).toEqual({
    id: newest.id,
    semver: '2.10.0',
  })
  expect(await findDraftCombineSuggestion(fx.payload, source, fx.users.teacher)).toBeNull()
  expect(await findDraftCombineSuggestion(fx.payload, newest, fx.users.editor)).toBeNull()
})
