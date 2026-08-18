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
// ⚑ The accordion's state-preservation test needs a plan that is still there when it runs, and the
// group-delete tests above it CONSUME `GROUP_PLAN_A`/`B`. Reusing those made the suite pass or fail
// on declaration order — a dependency nothing states and any reordering breaks silently. This plan
// belongs to that one test and is deleted by nothing.
const STATE_PLAN = `${MARK}State Survives Plan`

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

/**
 * Open one disclosure panel by its heading (the accordion redesign, D7).
 *
 * ⚑ Sections are now COLLAPSED by default for any role that sees more than one of them, so a test
 * that wants a panel's contents must say so. That is a deliberate behaviour change, not a
 * regression: the operator's brief was that Manage grows long and unwieldy.
 *
 * Idempotent, and it asserts the post-condition rather than assuming the click landed — a disclosure
 * that silently failed to open would otherwise surface as a confusing failure in the assertion after
 * it, several lines from the cause.
 */
const openPanel = async (page: Page, name: string) => {
  const trigger = page.getByRole('button', { name, exact: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

/** Open "Lesson plans" → "Delete lesson plans", the two-step most tests below need. */
const openDeletePanel = async (page: Page) => {
  await openPanel(page, 'Lesson plans')
  await openPanel(page, 'Delete lesson plans')
}

/**
 * The separator between panel ids in `?open=`, as it appears IN THE ADDRESS BAR.
 *
 * ⚑ `URLSearchParams.toString()` percent-encodes the comma, so the URL reads `open=access%2Cplans`
 * even though D7a's example writes `?open=users,access`. The two are the same URL — `%2C` decodes
 * to `,` — but an assertion matching a literal comma silently never matches, which is how this was
 * first written and how CI caught it. Accept either, rather than hand-rolling the encoding in
 * `serialiseOpen` just to make a test read nicely.
 */
const SEP = '(?:,|%2C)'

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
    // Owned by the accordion state-preservation test alone — see the ⚑ on STATE_PLAN.
    await fx.payload.create({
      collection: 'lesson-plans',
      data: { title: STATE_PLAN, subjectGrade: sg },
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
    // The "Lesson plans" section is a top-level panel, so its HEADING is visible while collapsed;
    // its three nested panels live inside the hidden body and appear once it is opened.
    await expect(page.getByRole('heading', { name: 'Lesson plans', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toBeHidden()
    await openPanel(page, 'Lesson plans')
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Repair' })).toBeVisible()
    await openPanel(page, 'Repair')
    await expect(page.locator('.lp-manage__list a', { hasText: POINTERLESS_TITLE })).toBeVisible()

    // Section separators (2026-08-04; MOVED to the panel wrapper 2026-08-17). Pins the ONE thing
    // review could not otherwise catch. It used to come from `__section ~ __section`, whose own
    // comment predicted that a wrapper element would silently drop every rule — the accordion is that
    // wrapper, and it did exactly that (measured: `0px, 1px, 1px` → `0px, 0px, 0px`), so the rule now
    // hangs off `.lp-admin-dash > .lp-accordion ~ .lp-accordion`. Same property, one level out: no
    // rule above the first panel, no trailing rule below the last. Purely visual, so nothing else here
    // would fail if it broke.
    const panels = page.locator('.lp-admin-dash > .lp-accordion')
    await expect(panels.first()).toHaveCSS('border-top-width', '0px')
    await expect(panels.last()).not.toHaveCSS('border-top-width', '0px')
    // …and nested panels are deliberately NOT separated, matching the pre-accordion rule that only
    // main sections get a rule.
    await expect(page.locator('.lp-accordion .lp-accordion').first()).toHaveCSS(
      'border-top-width',
      '0px',
    )
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
    await openDeletePanel(page)
    await expect(page.getByLabel(`Select ${MARK}Sub-strand`)).toBeVisible()
    await expect(page.getByLabel(`Select ${MARK}Plan`, { exact: true })).toHaveCount(0)
  })

  test('version editor shell: stripped chrome, Back to lesson, edit-intent unlock', async ({
    page,
  }) => {
    // Editor-shell smoke (Codex rounds 1–2: the chrome strip depends on pinned-Payload class names —
    // this catches an upstream class rename on upgrade). Opens the fixture's version with edit
    // intent as the teacher with editing access.
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
    await openDeletePanel(page)
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
    await openDeletePanel(page)
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
    await openDeletePanel(page)

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
    await openDeletePanel(page)

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

  /**
   * The accordion shell (D7/D7a). These assert the MECHANICS the design doc specifies, each of which
   * would otherwise be settled by whichever implementation an author reached for first:
   * conditional-render vs `hidden`, `router.push` vs `replaceState`, and what a stale deep link does.
   */
  test.describe('accordion', () => {
    /**
     * ⚑ ONE `loginAs` PER TEST — the whole file's idiom, and not a stylistic one. `login()` navigates
     * to `/login` and waits for the email input, but an authenticated session redirects away from
     * that route, so a second sign-in inside one test hangs until the 30s timeout. The first draft
     * covered both roles in a single test and failed in CI for exactly that reason.
     */
    test('an Editor’s only section is expanded for them', async ({ page }) => {
      // An Editor's saved versions are the whole page — nobody should click to reveal their only
      // panel (D7).
      await loginAs(page, 'editor')
      await page.goto(`${BASE}/admin`)
      await expect(
        page.getByRole('button', { name: 'My saved versions', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
    })

    test('a Site Admin, who sees several sections, starts fully collapsed', async ({ page }) => {
      // This is the redesign's whole point (the page grows long and unwieldy), so it is pinned
      // rather than left as an emergent default.
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      for (const name of ['Users', 'Curriculum & people', 'Editing access', 'Lesson plans']) {
        await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute(
          'aria-expanded',
          'false',
        )
      }
      // Nested panels are never auto-opened either — including Upload, which is the frequent action
      // and therefore the one most likely to be special-cased by a well-meaning later change.
      await openPanel(page, 'Lesson plans')
      await expect(
        page.getByRole('button', { name: 'Upload lesson plans', exact: true }),
      ).toHaveAttribute('aria-expanded', 'false')
    })

    test('toggling writes the URL but adds NO history entry', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      const depth = () => page.evaluate(() => window.history.length)
      const before = await depth()

      await openPanel(page, 'Editing access')
      await expect(page).toHaveURL(/[?&]open=access/)
      await openPanel(page, 'Lesson plans')
      await expect(page).toHaveURL(new RegExp(`[?&]open=access${SEP}plans`))

      // ⚑ The point of `replaceState` (D7a): a reader who opened four panels must not have to press
      // Back four times to leave the page. `router.push` here would also re-run the dashboard server
      // component and its ~9 queries on every click.
      expect(await depth()).toBe(before)

      // …and closing removes it again rather than accumulating stale ids.
      await page.getByRole('button', { name: 'Editing access', exact: true }).click()
      await expect(page).toHaveURL(/[?&]open=plans/)
      await expect(page).not.toHaveURL(/access/)
      expect(await depth()).toBe(before)
    })

    test('open state survives a genuine reload', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      await openPanel(page, 'Editing access')
      // A full page load is the case React state cannot survive and the reason the URL carries this
      // at all (D7).
      await page.reload()
      await expect(
        page.getByRole('button', { name: 'Editing access', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
    })

    test('a deep link opens the named panels, including a nested one', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      // `plans.delete` without `plans` — the ancestor must be opened too, or the child would be
      // rendered inside a hidden parent and the URL would describe a state the page is not in.
      await page.goto(`${BASE}/admin?open=plans.delete`)
      await expect(page.getByRole('button', { name: 'Lesson plans', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      await expect(
        page.getByRole('button', { name: 'Delete lesson plans', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
      await expect(page.getByLabel('Search lesson plans to delete')).toBeVisible()
    })

    test('unknown and role-inaccessible panel ids are ignored silently and scrubbed', async ({
      page,
    }) => {
      // A Subject Admin following a link containing a Site-Admin panel id must land on a normal page
      // — not an error, and not an empty panel implying something was withheld (D7a).
      await loginAs(page, 'subjectAdmin')
      await page.goto(`${BASE}/admin?open=curriculum,nonsense,access&at=sg-999`)
      await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Editing access', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
      // The URL is rewritten to what the page is actually showing: the inaccessible id, the typo and
      // the consumed one-shot `at` are all gone, and the valid one survives.
      await expect(page).toHaveURL(/[?&]open=access(&|$)/)
      await expect(page).not.toHaveURL(/curriculum|nonsense|at=/)
    })

    test('the disclosure is operable from the keyboard', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      const trigger = page.getByRole('button', { name: 'Editing access', exact: true })
      await trigger.focus()
      await page.keyboard.press('Enter')
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Space')
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      // The control keeps focus across the toggle — a disclosure that drops the user at the top of
      // the document on every press is unusable by keyboard.
      await expect(trigger).toBeFocused()
    })

    /**
     * ⚑ THE TEST THAT FAILS IF A PANEL IS CONDITIONALLY RENDERED (D7a, review round 5).
     *
     * `{open && <Panel/>}` is the shorter and more natural thing to write, and it silently destroys a
     * half-built multi-select or a chosen upload file on any stray click of a heading. Nothing else in
     * this file would notice.
     */
    test('closing a panel does not destroy its state: search and selection survive reopen', async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      await openDeletePanel(page)

      await page.getByLabel('Search lesson plans to delete').fill(STATE_PLAN)
      await page.getByLabel(`Select ${STATE_PLAN}`).check()
      await expect(page.getByRole('button', { name: /Delete selected \(1\)/ })).toBeVisible()

      // Close the OUTER panel — the stray-click case, which hides the whole subtree.
      await page.getByRole('button', { name: 'Lesson plans', exact: true }).click()
      await expect(page.getByLabel('Search lesson plans to delete')).toBeHidden()

      // Reopen BOTH: closing a parent also closes its children, so that reopening it does not spring
      // back to a subtree the user last saw several interactions ago. The work is preserved either
      // way — that is what this test is about — but it takes the same two clicks to get back to it.
      await openDeletePanel(page)
      await expect(page.getByLabel('Search lesson plans to delete')).toHaveValue(STATE_PLAN)
      await expect(page.getByLabel(`Select ${STATE_PLAN}`)).toBeChecked()
      await expect(page.getByRole('button', { name: /Delete selected \(1\)/ })).toBeVisible()
    })

    test('Candidate versions has a search that filters the rows (D3)', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      await openPanel(page, 'Candidate versions')
      const search = page.getByLabel('Search saved versions')
      await expect(search).toBeVisible()

      await expect(
        page.locator('.lp-manage__row-main .lp-manage__meta', { hasText: MARK }),
      ).toHaveCount(1)
      await search.fill('definitely-no-such-version')
      await expect(
        page.locator('.lp-manage__row-main .lp-manage__meta', { hasText: MARK }),
      ).toHaveCount(0)
      // A query that matches nothing says so, rather than falling back to the instructional empty
      // state — which would read as "you have never saved anything".
      await expect(page.locator('.lp-manage__empty')).toContainText('No saved versions match')
      const panel = page.locator('section.lp-accordion').filter({
        has: page.getByRole('button', { name: 'Candidate versions', exact: true }),
      })
      await expect(panel.locator('.lp-manage__list')).toHaveCount(0)
    })
  })

  /**
   * D4 — display-name editing lives in the avatar menu, not a "My Account" accordion: Manage is
   * unreachable by plain Teachers, so account self-service placed there would be invisible to most
   * users. Driven here as an Editor to prove it is not a Site-Admin-only affordance.
   */
  test('a user can change their own display name from the avatar menu', async ({ page }) => {
    await loginAs(page, 'editor')
    await page.goto(`${BASE}/admin`)
    const newName = `${MARK}renamed`

    await page.getByRole('button', { name: /Account menu/ }).click()
    await page.getByRole('button', { name: 'Change display name' }).click()

    // Cancel is a real reset, not merely a mode switch: stale draft text and validation errors must
    // not return when the form is reopened inside the still-mounted dropdown.
    await page.getByLabel('Display name').fill('')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.locator('.user-menu__edit-error')).toContainText('Enter a display name')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Change display name' }).click()
    await expect(page.getByLabel('Display name')).toHaveValue(`${MARK}editor`)
    await expect(page.locator('.user-menu__edit-error')).toHaveCount(0)

    await page.getByLabel('Display name').fill(newName)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // ⚑ ASSERT THE NEW VALUE, not merely that the menu still renders. An earlier version of this test
    // checked only that the account button and dropdown were visible after saving — which is true
    // whether or not the PATCH did anything, so it would have passed against a no-op Save.
    //
    // The form's value is the observable that proves it: the avatar INITIALS are not, because every
    // fixture name shares the `ZZ_INT_…` MARK prefix, so `${MARK}editor` and `${MARK}renamed` derive
    // identical initials and the avatar looks the same either way.
    await page.getByRole('button', { name: /Account menu/ }).click()
    await page.getByRole('button', { name: 'Change display name' }).click()
    await expect(page.getByLabel('Display name')).toHaveValue(newName)

    // Restore, so this test does not rename a fixture the rest of the file identifies by name.
    await page.getByLabel('Display name').fill(`${MARK}editor`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('button', { name: /Account menu/ }).click()
    await page.getByRole('button', { name: 'Change display name' }).click()
    await expect(page.getByLabel('Display name')).toHaveValue(`${MARK}editor`)
  })
})
