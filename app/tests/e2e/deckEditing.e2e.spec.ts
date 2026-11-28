import { expect, test } from '@playwright/test'

import { storeDeckSpec } from '../../src/decks/storage'
import spec from '../../src/decks/vendor/fixtures/L1.spec.json'
import type { DeckVersion } from '../../src/payload-types'
import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { restorePrompt } from '../helpers/editRecoveryUi'
import { MARK, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture
let deckId: number
let sourceId: number

test.beforeAll(async () => {
  fx = await setupRoleFixture()
  const deck = await fx.payload.create({
    collection: 'decks',
    data: {
      title: `${MARK} Lesson deck`,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      substrandId: fx.version.meta!.substrand_id!,
      lessonNumber: 1,
      importFingerprint: 'deck-editing-test',
    },
  })
  deckId = deck.id
  const source = await fx.payload.create({
    collection: 'deck-versions',
    data: {
      deck: deck.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.0.0',
      spec: storeDeckSpec(spec) as DeckVersion['spec'],
    },
  })
  sourceId = source.id
  await fx.payload.update({
    collection: 'decks',
    id: deck.id,
    data: { officialVersion: source.id },
  })
})

test.afterAll(async () => {
  await fx?.teardown()
})

test('a teacher with editing access restores a slide draft and saves version 1.0.1', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const lessonUrl = `${BASE}/lessons/${fx.plan.id}`
  const editLink = page.getByRole('link', { name: 'Edit Lesson 1 slides' })

  await loginAs(page, fx, 'teacher')
  await page.goto(lessonUrl)
  await page.getByRole('button', { name: /Share/ }).click()
  await expect(editLink).toHaveCount(0)

  await page.context().clearCookies()
  await loginAs(page, fx, 'editor')
  await page.goto(lessonUrl)
  await page.getByRole('button', { name: /Share/ }).click()
  await editLink.click()
  await expect(page).toHaveURL(new RegExp(`/admin/collections/deck-versions/${sourceId}\\?`))
  const showSlides = page.locator('#field-spec__slides').getByRole('button', { name: 'Show All' })
  const title = page.locator('#field-spec__slides__0__title')
  await showSlides.click()
  await expect(
    page.locator('#field-spec__slides').getByRole('button', { name: 'Add Slide' }),
  ).toBeHidden()
  const newTitle = 'A closer look at cells'
  await title.fill(newTitle)
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expect(page.getByRole('button', { name: 'Continue editing' })).toBeVisible()

  await page.reload()
  const prompt = restorePrompt(page)
  await expect(prompt).toContainText(newTitle)
  await prompt.getByRole('button', { name: 'Restore my draft' }).click()
  await expect(prompt).toBeHidden()
  if (!(await title.isVisible())) await showSlides.click()
  await expect(title).toHaveValue(newTitle)
  await page.getByRole('button', { name: 'Save as new version' }).click()
  await expect(page.locator('.lesson-controls__semver')).toHaveText('v1.0.1')
  const savedId = Number(new URL(page.url()).pathname.split('/').pop())
  await expect(page.getByRole('link', { name: 'Download PowerPoint' })).toHaveAttribute(
    'href',
    `/api/decks/${deckId}/download?deckVersion=${savedId}&planVersion=${fx.version.id}&as=pptx`,
  )
})
