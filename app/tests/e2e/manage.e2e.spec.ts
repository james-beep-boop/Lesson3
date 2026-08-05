/**
 * Manage-page coverage (IA redesign PR ③ / Codex 2026-07-01 #7) — the role-scoped functions page
 * (`src/components/AdminDashboard`) replaced both the admin lesson-plans catalogue and the versions
 * list, so it is now the custom admin surface with the highest regression risk and no other UI
 * coverage. This spec drives the REAL rendered page and asserts what each role sees and the two
 * interactive flows:
 *
 *   1. Role scoping — editing-access user: ONLY "My saved versions"; Subject Admin: "Candidate
 *      versions" + "Editing access"; Site Admin: + "Curriculum & people" and "Lesson plans" (with
 *      Upload / Delete / Repair as sub-headings beneath it).
 *   2. Redirects — the retired list routes (`/admin/collections/lesson-plans`,
 *      `…/lesson-bundle-versions`) land on Manage, and the "Lesson plans" nav group is hidden.
 *   3. Repair — a pointerless plan appears in the Site-Admin Repair section (clean name, links to
 *      the plan form).
 *   4. Delete lesson plans — search → select → delete removes the plan.
 *   5. Section separators — the CSS-only rules between main sections (purely visual, so nothing else
 *      here would fail if they broke).
 *
 * HOW IT RUNS (like the http suite: needs a running app + a seedable DB; Playwright is dev-only, not
 * in the Rock container gate). Seeds the shared MARK-tagged self-cleaning role fixture via the Local
 * API into the SAME DB the app serves; browse via `E2E_BASE_URL` (default `http://localhost:3000`).
 * Every seeded record's visible text carries the per-run MARK, so assertions locate exactly this
 * run's rows regardless of real corpus.
 */
import { test, expect, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import {
  MARK,
  minimalBundleContent,
  setupRoleFixture,
  type RoleFixture,
  type RoleKey,
} from '../helpers/fixtures'

const POINTERLESS_TITLE = `${MARK}Pointerless Plan`
const DELETABLE_TITLE = `${MARK}Deletable Plan`
const CANDIDATE_TITLE = `${MARK}Plan v1.1.0`
// Two plans sharing one strand, so the delete panel's STRAND checkbox has something to select as a
// group. Strand 77 is its own strand (the base fixture's plan is 99.1), and the panel derives the
// heading from `unit.strand` + the sub-strand number, giving "Strand 77: Group Delete".
const GROUP_STRAND = 'Strand 77: Group Delete'
// Distinct WORDS, not "A"/"B": search is a token-AND substring match, so "…Plan A" would also match
// "…Plan B" (every token of the first appears in the second) and the hidden-selection assertion below
// would have nothing hidden.
const GROUP_PLAN_A = `${MARK}Group Plan Alpha`
const GROUP_PLAN_B = `${MARK}Group Plan Beta`

let fx: RoleFixture

/**
 * The group checkboxes take their accessible name from their own label TEXT (no `aria-label`), with the
 * subject-grade added as visually-hidden text on strand groups so two "Other" strands are
 * distinguishable. `exact` matters: a subject-grade's name is a substring of every one of its strands'
 * names, so a loose match would resolve to several controls.
 */
const sgPick = (page: Page, sgLabel: string) =>
  page.getByRole('checkbox', { name: sgLabel, exact: true })
const strandPick = (page: Page, strand: string, sgLabel: string) =>
  page.getByRole('checkbox', { name: `${strand} in ${sgLabel}`, exact: true })

/** Thin wrapper so the many call sites below keep reading `loginAs(page, 'editor')`. */
const loginAs = (page: Page, key: RoleKey): Promise<void> => loginAsRole(page, fx, key)

test.describe('Manage page', () => {
  test.beforeAll(async () => {
    fx = await setupRoleFixture()
    const sg = fx.subjectGrade.id
    // A pointerless plan (Repair section) and a throwaway the delete test consumes.
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: POINTERLESS_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: DELETABLE_TITLE, subjectGrade: sg },
      overrideAccess: true,
    })
    // A genuine non-Official CANDIDATE on the fixture plan (whose Official is still v1.0.0). Required
    // since 2026-08-04: the Candidate versions section is hidden entirely for an administrator with
    // nothing to tidy, so without a real candidate this spec would assert a heading that correctly
    // does not exist. It also makes the spec finally test its own name — previously "sees candidates"
    // passed against an empty list showing only its empty state.
    await fx.payload.create({
      collection: 'lesson-bundle-versions',
      data: {
        lessonPlan: fx.plan.id,
        subjectGrade: sg,
        semver: '1.1.0',
        title: CANDIDATE_TITLE,
        // `author` is systemOnly at field level, which `overrideAccess: true` bypasses. Set here so the
        // row has a name to resolve — that is what proves the `authors` lookup (see the display test).
        author: fx.users.editor.id,
        ...minimalBundleContent(),
      } as never,
      overrideAccess: true,
    })

    // Two plans in ONE strand (77), each with an Official version carrying the curriculum coordinates
    // the delete panel groups by — plan, version, then the Official pointer, in ingest order.
    for (const [i, title] of [GROUP_PLAN_A, GROUP_PLAN_B].entries()) {
      const p = await fx.payload.create({
        collection: 'lesson-plans',
        data: { title, subjectGrade: sg },
        overrideAccess: true,
      })
      const content = minimalBundleContent()
      const v = await fx.payload.create({
        collection: 'lesson-bundle-versions',
        data: {
          lessonPlan: p.id,
          subjectGrade: sg,
          semver: '1.0.0',
          title,
          ...content,
          // `substrand_name` is what the row DISPLAYS (lessonDisplayName prefers it over the title),
          // so the checkbox's "Select <name>" label is this title.
          meta: { ...content.meta, substrand_id: `77.${i + 1}`, substrand_name: title },
          unit: { strand: `Strand 77.0: Group Delete` },
        } as never,
        overrideAccess: true,
      })
      await fx.payload.update({
        collection: 'lesson-plans',
        id: p.id,
        data: { officialVersion: v.id },
        overrideAccess: true,
      })
    }
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('Editor sees ONLY "My saved versions"', async ({ page }) => {
    await loginAs(page, 'editor')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'My saved versions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Editing access' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toHaveCount(0)
    // The "Lesson plans" nav group is hidden (CSS display:none — still in the DOM, so assert
    // visibility, not count).
    await expect(page.locator("[id='nav-group-Lesson plans']")).toBeHidden()
  })

  test('Subject Admin sees candidates + Editing access, no Site-Admin panels', async ({ page }) => {
    await loginAs(page, 'subjectAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Candidate versions' })).toBeVisible()
    // The seeded non-Official candidate is actually LISTED — the heading alone used to pass against
    // an empty list. Selector note: `.lp-manage__row` alone would ALSO match the editors widget's
    // rows, which reuse it (`--tight`); `.lp-manage__row-main` is the candidate row's own structure.
    // A bare count is safe despite a shared DB: a Subject Admin only sees candidates in their own
    // subject-grade, and this run's subject-grade is freshly MARK-seeded.
    await expect(page.locator('.lp-manage__row:has(.lp-manage__row-main)')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Editing access' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toHaveCount(0)
    // `exact` because Playwright's role-name match is a case-insensitive SUBSTRING by default, so a
    // bare 'Lesson plans' would also match "Upload lesson plans" and stop testing the new h2 itself.
    await expect(page.getByRole('heading', { name: 'Lesson plans', exact: true })).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Curriculum & people', exact: true }),
    ).toHaveCount(0)
  })

  test('retired list routes redirect to Manage', async ({ page }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin/collections/lesson-plans`)
    await expect(page).toHaveURL(`${BASE}/admin`)
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions`)
    await expect(page).toHaveURL(`${BASE}/admin`)
  })

  test('Site Admin: Repair lists the pointerless plan; full panel set present', async ({
    page,
  }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Repair' })).toBeVisible()
    await expect(page.locator('.lp-manage__list a', { hasText: POINTERLESS_TITLE })).toBeVisible()

    // Section separators (2026-08-04). Pins the ONE thing review could not otherwise catch: the rules
    // come from `__section ~ __section` in CSS, so a future wrapper element around a section would
    // silently drop every rule, or a `:first-of-type`-style regression would draw one directly under
    // the page title. Purely visual, so no other assertion would fail.
    const sections = page.locator('.lp-admin-dash__section')
    await expect(sections.first()).toHaveCSS('border-top-width', '0px')
    await expect(sections.last()).not.toHaveCSS('border-top-width', '0px')
    // And a bordered list never closes with its own divider (that plus a section rule reads as a
    // table edge) — checked on Curriculum & people, which is a flat <ul>.
    await expect(page.locator('.lp-admin-dash__actions li').last()).toHaveCSS(
      'border-bottom-width',
      '0px',
    )
  })

  // ⚑ INVARIANT, pinned deliberately BEFORE the depth-0 perf rewrite (2026-08-04): an Official version
  // is never offered as a candidate. The module contract is "no row is shown that the server would
  // refuse", and Officials are undeletable.
  //
  // Why it is worth its own test: the filter reads the POPULATED plan (`typeof v.lessonPlan ===
  // 'object'`) and fails OPEN when it is absent — `plan == null` returns true, i.e. KEEP. So dropping
  // that query to depth 0 without first building a plan→Official map would list every Official in the
  // corpus as deletable. Written against the depth-2 code it passes immediately; its job is to fail the
  // moment a naive depth change lands. Both fixture versions share a `substrand_name`, so the rows are
  // distinguished by the metadata line's semver, not the label.
  test('an Official version is never listed as a candidate', async ({ page }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Candidate versions' })).toBeVisible()
    // This run's rows only — the fixture subject-grade's displayName carries the MARK.
    const meta = page.locator('.lp-manage__row-main .lp-manage__meta', { hasText: MARK })
    // fx seeds v1.0.0 as the plan's Official, and v1.1.0 as a non-Official candidate on that plan.
    await expect(meta.filter({ hasText: 'Version 1.1.0' })).toHaveCount(1)
    await expect(meta.filter({ hasText: 'Version 1.0.0' })).toHaveCount(0)
  })

  // The depth-0 rewrite (2026-08-04) resolves every display string through an explicit lookup instead of
  // relationship population. The exclusion paths are covered above; these two assertions cover the
  // remaining lookups, each of which would fail SILENTLY — a missing name renders '' or 'Unknown
  // author', which no other assertion notices.
  test('display lookups resolve: author name and the Official sub-strand name', async ({
    page,
  }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)

    // `authors`: the candidate was seeded with the editor as author, whose name is `${MARK}editor`.
    // Site Admins see the author in the row's metadata line (showAuthor), so a broken lookup would
    // render "Unknown author" here.
    await expect(
      page.locator('.lp-manage__row-main .lp-manage__meta', { hasText: 'Version 1.1.0' }),
    ).toContainText(`${MARK}editor`)

    // `officialMeta`: a plan row's label comes from its OFFICIAL version's `meta.substrand_name`, not
    // from the plan's own title — `lessonDisplayName` prefers the sub-strand name. fx.plan is titled
    // `${MARK}Plan` while its Official's sub-strand is `${MARK}Sub-strand`, so seeing the latter proves
    // the lookup resolved rather than falling back to the title.
    await expect(page.getByLabel(`Select ${MARK}Sub-strand`)).toBeVisible()
    await expect(page.getByLabel(`Select ${MARK}Plan`, { exact: true })).toHaveCount(0)
  })

  test('version editor shell: stripped chrome, Back to lesson, edit-intent unlock', async ({
    page,
  }) => {
    // Editor-shell smoke (Codex rounds 1–2: the chrome strip depends on pinned-Payload class names —
    // this catches an upstream class rename on upgrade). Opens the fixture's version with edit
    // intent as the Editor.
    await loginAs(page, 'editor')
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions/${fx.version.id}?edit=1`)
    // Our control bar renders, with the shared page-level Back control at the far right. It uses the
    // same Next Link component and visual tokens as the frontend pages; crossing root layouts still
    // becomes a full navigation automatically.
    const back = page.locator('.lesson-controls__group--back a')
    await expect(back).toBeVisible()
    await expect(back).toHaveClass(/(^|\s)btn(\s|$)/)
    await expect(back).toHaveAttribute('href', `/lessons/${fx.plan.id}?version=${fx.version.id}`)
    // Payload chrome is stripped on this page (CSS-hidden): nav sidebar + app-header/breadcrumbs.
    await expect(page.locator('.template-default .nav')).toBeHidden()
    await expect(page.locator('.app-header')).toBeHidden()
    // The native Save button stays hidden (our bar owns Save via save-as-new).
    await expect(page.locator('.doc-controls .form-submit')).toBeHidden()
    // Edit intent honoured: a prose textarea is editable for the Editor (form landed unlocked).
    await expect(page.locator('textarea').first()).toBeEditable()
  })

  // Searching flattens the tree and REMOVES the group checkboxes (2026-08-04). A group checkbox beside
  // filtered results would read ambiguously as "all 12 in this strand" or "the 2 you can see", so the
  // absence is the safety property, not a layout preference — hence an assertion rather than a comment.
  test('Delete panel: searching goes flat, drops group controls, keeps the scope', async ({
    page,
  }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    const sgLabel = `${fx.subject.name} · Grade 99`

    // Unfiltered: the curriculum tree, with a checkbox at each level. `exact` on the subject-grade
    // heading is required, not defensive: role-name matching is a SUBSTRING match by default, and every
    // strand heading beneath this one now ends in the subject-grade name (the visually-hidden
    // disambiguator), so a loose match resolves to the whole group and trips strict mode.
    await expect(page.getByRole('heading', { name: sgLabel, exact: true })).toBeVisible()
    await expect(sgPick(page, sgLabel)).toBeVisible()
    await expect(strandPick(page, GROUP_STRAND, `${fx.subject.name} · Grade 99`)).toBeVisible()
    // A plan with no Official version has no coordinates, so it groups under "Other" and stays
    // deletable — the Repair case must not vanish from the one panel that can clear it.
    await expect(
      page.getByRole('heading', { name: `Other in ${sgLabel}`, exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel(`Select ${POINTERLESS_TITLE}`)).toBeVisible()

    // Select a plan that the coming search will hide, so the notice below has something to report.
    await page.getByLabel(`Select ${GROUP_PLAN_B}`).check()

    await page.getByLabel('Search lesson plans to delete').fill(GROUP_PLAN_A)
    await expect(page.getByLabel(`Select ${GROUP_PLAN_A}`)).toBeVisible()
    await expect(page.getByLabel(`Select ${GROUP_PLAN_B}`)).toHaveCount(0)
    await expect(sgPick(page, sgLabel)).toHaveCount(0)
    await expect(strandPick(page, GROUP_STRAND, `${fx.subject.name} · Grade 99`)).toHaveCount(0)
    // …and the row carries its scope inline instead, since the headings are gone.
    await expect(page.locator('.lp-delete-plans .lp-manage__meta')).toContainText(sgLabel)

    // The button still counts the hidden pick — so the panel says so, and offers a way out. Without
    // this an administrator can search, see one row, and delete two.
    await expect(page.getByRole('button', { name: /Delete selected \(1\)/ })).toBeVisible()
    await expect(page.locator('.lp-delete-plans__hidden')).toContainText(
      '1 lesson plan selected but not shown',
    )
    await page.getByRole('button', { name: 'Clear selection' }).click()
    await expect(page.locator('.lp-delete-plans__hidden')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0)
  })

  // The OTHER group level. Deliberately CANCELS rather than deleting: this subject-grade holds the
  // shared fixture (its plan, its candidate version, the Repair plan and the strand-77 pair), so a
  // real delete here would strip the world every other test in this file depends on. Selection,
  // descendant fan-out and the confirmation copy are all observable without going through with it.
  test('Site Admin can select a whole subject-grade; the confirmation names it', async ({
    page,
  }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    const sgLabel = `${fx.subject.name} · Grade 99`

    await sgPick(page, sgLabel).check()

    // Every descendant strand ticks, across BOTH strands — the strand-77 pair and the coordinate-less
    // plans that group under "Other".
    const strandBox = strandPick(page, GROUP_STRAND, `${fx.subject.name} · Grade 99`)
    await expect(strandBox).toBeChecked()
    expect(await strandBox.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(false)
    await expect(strandPick(page, 'Other', sgLabel)).toBeChecked()
    // …and so does every plan row beneath them.
    for (const title of [GROUP_PLAN_A, GROUP_PLAN_B, POINTERLESS_TITLE]) {
      await expect(page.getByLabel(`Select ${title}`)).toBeChecked()
    }

    await page.getByRole('button', { name: /Delete selected/ }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(`in ${sgLabel}`)
    // The taxonomy carve-out: a group delete removes PLANS, and says so.
    await expect(dialog).toContainText('The subject grade itself stays')
    await expect(dialog).toContainText('This cannot be undone.')
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Cancelling deletes nothing and keeps the selection, so a mis-click costs no work.
    await expect(page.getByLabel(`Select ${GROUP_PLAN_A}`)).toBeChecked()
  })

  test('Site Admin can delete a plan from the Delete panel', async ({ page }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)

    await page.getByLabel('Search lesson plans to delete').fill(DELETABLE_TITLE)
    const checkbox = page.getByLabel(`Select ${DELETABLE_TITLE}`)
    await expect(checkbox).toBeVisible()
    await checkbox.check()
    await page.getByRole('button', { name: /Delete selected/ }).click()

    // ONE plan: the confirmation still says it cannot be undone, but asks for no typed word.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Delete 1 lesson plan, including all of its saved versions.')
    await expect(dialog).toContainText('This cannot be undone.')
    await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()

    // After the sequential by-ID delete + router.refresh(), the row is gone.
    await expect(page.getByLabel(`Select ${DELETABLE_TITLE}`)).toHaveCount(0)
  })

  test('Site Admin deletes a whole strand from one group checkbox', async ({ page }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)

    await strandPick(page, GROUP_STRAND, `${fx.subject.name} · Grade 99`).check()
    await expect(page.getByLabel(`Select ${GROUP_PLAN_A}`)).toBeChecked()
    await expect(page.getByLabel(`Select ${GROUP_PLAN_B}`)).toBeChecked()

    // The subject-grade above it is now INDETERMINATE — its other strands are untouched. Read off the
    // DOM property: `indeterminate` has no attribute and no Playwright matcher.
    const sgBox = sgPick(page, `${fx.subject.name} · Grade 99`)
    await expect(sgBox).not.toBeChecked()
    expect(await sgBox.evaluate((el) => (el as HTMLInputElement).indeterminate)).toBe(true)

    await page.getByRole('button', { name: /Delete selected \(2\)/ }).click()
    const dialog = page.getByRole('dialog')
    // Named, not just counted — the confirmation says WHICH strand.
    await expect(dialog).toContainText(`Delete ALL 2 lesson plans in ${GROUP_STRAND}`)
    await expect(dialog).toContainText('This cannot be undone.')

    // Above one plan the word must be typed before Delete is live.
    const confirm = dialog.getByRole('button', { name: 'Delete', exact: true })
    await expect(confirm).toBeDisabled()
    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expect(page.getByLabel(`Select ${GROUP_PLAN_A}`)).toHaveCount(0)
    await expect(page.getByLabel(`Select ${GROUP_PLAN_B}`)).toHaveCount(0)
    // The strand was derived from those plans, so its heading goes with them.
    await expect(strandPick(page, GROUP_STRAND, `${fx.subject.name} · Grade 99`)).toHaveCount(0)
  })
})
