/** ZIP import reporting in the real Manage panel, against a disposable database and running app. */
import JSZip from 'jszip'
import { test, expect } from '@playwright/test'

import { E2E_BASE as BASE, loginAs } from '../helpers/e2e'
import { MARK, minimalResourceLinks, setupRoleFixture, type RoleFixture } from '../helpers/fixtures'

let fx: RoleFixture

const raw = (id: string) => ({
  schemaVersion: '1.0.0',
  META: {
    subject: fx.subject.name,
    grade: fx.subjectGrade.grade,
    substrand_id: id,
    substrand_name: `${MARK}${id}`,
    titleDoc: `${MARK}ZIP ${id}`,
  },
  UNIT: null,
  LESSONS: [
    {
      number: 1,
      title: `${MARK}Lesson`,
      duration: '40 minutes',
      slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'x',
          teacherMoves: 'y',
          sensemakingStrategy: 'z',
          formativeAssessment: 'w',
        },
      ],
      resourceLinks: minimalResourceLinks(),
      summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
    },
  ],
  FINAL_EXPLANATION: null,
  SUMMARY_TABLE: null,
})

test.describe('ZIP upload report', () => {
  test.setTimeout(120_000)
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
  })
  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('imports valid files and shows rejected and skipped filenames after refresh', async ({
    page,
  }, testInfo) => {
    await loginAs(page, fx, 'siteAdmin')
    await page.goto(`${BASE}/admin?open=plans,plans.upload`)
    const zip = new JSZip()
      .file('first.json', JSON.stringify(raw('99.browserZip1')))
      .file('broken.json', '{broken')
      .file('invalid.json', '{}')
      .file('folder/last.json', JSON.stringify(raw('99.browserZip2')))
      .file('readme.txt', 'Notes')
    await page.locator('input[type=file]').setInputFiles({
      name: 'lessons.zip',
      mimeType: 'application/zip',
      buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    })
    await page.getByRole('button', { name: 'Upload 1 file(s)', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Imported 2 file(s); rejected 2; skipped 1.' }),
    ).toBeVisible()
    await expect(page.getByText('lessons.zip/broken.json', { exact: true })).toBeVisible()
    await expect(page.getByText('lessons.zip/invalid.json', { exact: true })).toBeVisible()
    await expect(page.getByText(/lessons.zip\/folder\/last.json · New/)).toBeVisible()
    await expect(page.getByText(/lessons.zip\/readme.txt:/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('mixed-upload.png'), fullPage: true })

    zip.file('broken.json', JSON.stringify(raw('99.browserZip3')))
    zip.file('invalid.json', JSON.stringify(raw('99.browserZip4')))
    const corrected = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'lessons.zip', mimeType: 'application/zip', buffer: corrected })
    await page.getByRole('button', { name: 'Upload 1 file(s)', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Imported 2 file(s); rejected 0; skipped 3.' }),
    ).toBeVisible()
    await expect(page.getByText(/lessons.zip\/first.json: Unchanged/)).toBeVisible()
    await expect(page.getByText(/lessons.zip\/folder\/last.json: Unchanged/)).toBeVisible()
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'lessons.zip', mimeType: 'application/zip', buffer: corrected })
    await page.getByRole('button', { name: 'Upload 1 file(s)', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Imported 0 file(s); rejected 0; skipped 5.' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('unchanged-upload.png'), fullPage: true })

    // A completed all-invalid attempt replaces the earlier successes with its own report.
    await page.locator('input[type=file]').setInputFiles({
      name: 'bad.zip',
      mimeType: 'application/zip',
      buffer: await new JSZip().file('bad.json', '{').generateAsync({ type: 'nodebuffer' }),
    })
    await page.getByRole('button', { name: 'Upload 1 file(s)', exact: true }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Imported 0 file(s); rejected 1; skipped 0.' }),
    ).toBeVisible()
    await expect(page.getByText('bad.zip/bad.json', { exact: true })).toBeVisible()
    await expect(page.getByText(/lessons.zip\/folder\/last.json · New/)).toHaveCount(0)
  })
})
