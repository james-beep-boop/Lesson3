/**
 * Manage-page coverage (IA redesign PR ③ / Codex 2026-07-01 #7) — the role-scoped functions page
 * (`src/components/AdminDashboard`) replaced both the admin lesson-plans catalogue and the versions
 * list, so it is now the custom admin surface with the highest regression risk and no other UI
 * coverage. This spec drives the REAL rendered page and asserts what each role sees and the two
 * interactive flows:
 *
 *   1. Role scoping — editing-access user: ONLY "My saved versions"; Subject Admin: "Candidate
 *      versions" + the "Users" box holding "Roles & Access"; Site Admin: all four boxes — "Users"
 *      (Accounts / Roles & Access), "Curriculum" (Subjects / Subject grades), "Lesson plans"
 *      (Upload / Delete / Repair) and the candidate inventory. ⚑ The top level became FOUR BOXES on
 *      2026-08-18; panels that used to be top-level are nested, so a test that wants one must open
 *      its group first.
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
import { test, expect, type Locator, type Page } from '@playwright/test'

import { E2E_BASE as BASE, loginAs as loginAsRole } from '../helpers/e2e'
import {
  createUserVerified,
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
const MANAGE_USER_NAME = `${MARK}Manage action target`
const MANAGE_USER_RENAMED = `${MARK}Manage action renamed`
const MANAGE_USER_EMAIL = `${MARK.toLowerCase()}manage-action@example.com`
const UNVERIFIED_USER_NAME = `${MARK}Manage unverified target`
const UNVERIFIED_USER_EMAIL = `${MARK.toLowerCase()}manage-unverified@example.com`
const DELETE_USER_NAME = `${MARK}Manage deletion target`
const DELETE_USER_EMAIL = `${MARK.toLowerCase()}manage-delete@example.com`

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

/** Search the lazy directory for exactly one fixture account and disclose its mounted details. */
const openUser = async (page: Page, email: string): Promise<Locator> => {
  await page.getByLabel('Search users by name or email').fill(email)
  const row = page.locator('.lp-users__row').filter({ hasText: email })
  await expect(row).toBeVisible()
  const summary = row.locator('.lp-users__summary')
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click()
  await expect(summary).toHaveAttribute('aria-expanded', 'true')
  return row
}

/** Accept one native confirmation while returning its exact message for consequence assertions. */
const acceptConfirmation = async (page: Page, action: () => Promise<void>): Promise<string> => {
  const message = new Promise<string>((resolve) => {
    page.once('dialog', async (dialog) => {
      const text = dialog.message()
      await dialog.accept()
      resolve(text)
    })
  })
  await action()
  return message
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

    // Dedicated Users-panel accounts. Keep them separate from the role fixture: the UI test mutates
    // authorization state deliberately, and no later assertion should inherit that state by accident.
    await createUserVerified(fx.payload, {
      name: MANAGE_USER_NAME,
      email: MANAGE_USER_EMAIL,
      password: fx.password,
      assignments: [{ subjectGrade: fx.subjectGrade.id, role: 'editor' }],
    })
    await createUserVerified(fx.payload, {
      name: UNVERIFIED_USER_NAME,
      email: UNVERIFIED_USER_EMAIL,
      password: fx.password,
      _verified: false,
    })
    await createUserVerified(fx.payload, {
      name: DELETE_USER_NAME,
      email: DELETE_USER_EMAIL,
      password: fx.password,
    })
  })

  test.afterAll(async () => {
    await fx?.teardown()
  })

  test('a Teacher with editing access sees ONLY "My saved versions"', async ({ page }) => {
    await loginAs(page, 'editor')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'My saved versions' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Roles & Access' })).toHaveCount(0)
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
    // ⚑ REGROUPED (2026-08-18): Roles & Access is a CHILD of the Users box now, so a Subject Admin's
    // top level shows the GROUP. Two assertions replace the old single one, and the pair is the real
    // authorization statement: the box renders because they can see something inside it, and the
    // Accounts panel inside it — Site-Admin-only — is not rendered at all.
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toHaveCount(0)
    // Two top-level boxes (Users, Candidate versions) means the single-section auto-expand does not
    // apply, so their panel opens on a click rather than on arrival.
    await openPanel(page, 'Users')
    await expect(page.getByRole('heading', { name: 'Roles & Access' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload lesson plans' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Delete lesson plans' })).toHaveCount(0)
    // `exact` because Playwright's role-name match is a case-insensitive SUBSTRING by default, so a
    // bare 'Lesson plans' would also match "Upload lesson plans" and stop testing the new h2 itself.
    await expect(page.getByRole('heading', { name: 'Lesson plans', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Subjects', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Subject grades', exact: true })).toHaveCount(0)
  })

  test('retired list routes redirect to Manage', async ({ page }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin/collections/lesson-plans`)
    await expect(page).toHaveURL(`${BASE}/admin`)
    await page.goto(`${BASE}/admin/collections/lesson-bundle-versions`)
    await expect(page).toHaveURL(`${BASE}/admin`)
    await page.goto(`${BASE}/admin/collections/users`)
    // ⚑ All three destinations became NESTED ids in the 2026-08-18 regrouping. One parameter still
    // suffices: `parseOpen` opens every ancestor of an id it accepts, so the group and the panel
    // inside it both open. `tsc` caught the stale literals in `RedirectToManage` — `PanelId` is what
    // makes a wrong destination a compile error instead of a page that opens nothing.
    //
    // ⚑ ASSERT THE CANONICAL URL, NOT THE REDIRECT'S OWN. `RedirectToManage` sends the browser to
    // `?open=users.accounts`; the page then mirrors its real open set back, which includes the
    // ancestor — so the address bar settles on `users,users.accounts`. An assertion anchored on the
    // redirect's literal query was RACING that write and passed only when it polled first: it survived
    // one run and failed the next with no code change between them. Match where the URL comes to rest.
    await expect(page).toHaveURL(new RegExp(`${BASE}/admin\\?open=users${SEP}users\\.accounts$`))
    // PR 3: the two taxonomy tables are replaced by panels the same way.
    await page.goto(`${BASE}/admin/collections/subjects`)
    await expect(page).toHaveURL(
      new RegExp(`${BASE}/admin\\?open=curriculum${SEP}curriculum\\.subjects$`),
    )
    await page.goto(`${BASE}/admin/collections/subject-grades`)
    await expect(page).toHaveURL(
      new RegExp(`${BASE}/admin\\?open=curriculum${SEP}curriculum\\.subject-grades$`),
    )
  })

  test('Site Admin: Repair lists the pointerless plan; full panel set present', async ({
    page,
  }) => {
    await loginAs(page, 'siteAdmin')
    await page.goto(`${BASE}/admin`)
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
    // …and its children are inside the closed box, so they are in the DOM but not on screen. Same
    // property as "Lesson plans" below; asserted here too because the Users box is where the
    // regrouping put a panel that used to be top-level.
    //
    // ⚑ `includeHidden` AND A COUNT, because `toBeHidden()` ALONE ASSERTED NOTHING HERE. `getByRole`
    // excludes the hidden subtree by default, so the locator matched zero elements — and `toBeHidden()`
    // passes on an empty locator (a node that does not exist is not visible). It would have gone on
    // passing if the panel were deleted outright. `toHaveCount(1)` is what makes the pair meaningful:
    // the heading EXISTS, and it is not on screen. Same vacuity as the sibling case that failed with
    // "element(s) not found" during this work — one direction is loud, the other silent.
    const accountsHeading = page.getByRole('heading', {
      name: 'Accounts',
      exact: true,
      includeHidden: true,
    })
    await expect(accountsHeading).toHaveCount(1)
    await expect(accountsHeading).toBeHidden()
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

    // Panel boxes (2026-08-18) — the same invariant this block has always pinned, one property along.
    // It began as section separators from `__section ~ __section` (2026-08-04), whose own comment
    // predicted that a wrapper element would silently drop every rule; the accordion was that wrapper
    // and did exactly that (measured: `0px, 1px, 1px` → `0px, 0px, 0px`), so it moved to
    // `.lp-admin-dash > .lp-accordion ~ .lp-accordion` (2026-08-17). The hairline is now GONE: each
    // top-level panel is a bordered box, and the space between boxes is margin.
    //
    // ⚑ SO THE POLARITY FLIPPED, and that is the point of re-reading this rather than patching it. The
    // old assertion was "the FIRST panel has no top border" — the box makes that false by design, and
    // an assertion that still passed after this change would have been pinning nothing. What is
    // structural now: EVERY top-level panel is boxed (the rule hangs off the child combinator, so
    // introducing a wrapper drops all of them at once), and nested panels are not.
    const panels = page.locator('.lp-admin-dash > .lp-accordion')
    const count = await panels.count()
    expect(count).toBeGreaterThan(1)
    for (let i = 0; i < count; i++) {
      await expect(panels.nth(i)).toHaveCSS('border-top-width', '1px')
    }
    // …and nested panels (Upload / Delete / Repair) stay unboxed, matching the pre-accordion rule that
    // only main sections carried a line of their own. Boxes inside boxes are the decoration the visual
    // system rules out.
    await expect(page.locator('.lp-accordion .lp-accordion').first()).toHaveCSS(
      'border-top-width',
      '0px',
    )
    // ⚑ THE ROW OWNS THE GAP BETWEEN NESTED PANELS, NOT ITS HEADING (2026-08-19). This is the one
    // assertion standing between that refactor and its own undoing, and it is here because the same
    // rule caused two visible defects in a single day: ~40px of dead air at the top of every open box,
    // and — in a rejected mockup that bordered nested rows — an unfilled white stripe above rows 2 and
    // 3 while row 1 was clean. Both were patched by zeroing one more first child, which fixes a row at
    // a time and leaves the rest latent.
    //
    // A heading's margin ESCAPES its `<section>` (no border, no padding to stop it collapsing through),
    // so a margin there is spacing that belongs to the row but cannot be wrapped by it. The pair below
    // pins both halves: 24px between sibling ROWS, and nothing on the heading. Purely visual, so
    // nothing else in this file would notice if it regressed — which is exactly why it is asserted.
    const nestedPanels = page.locator('.lp-accordion .lp-accordion')
    await expect(nestedPanels.nth(1)).toHaveCSS('margin-top', '24px')
    // ⚑ The heading half is asserted over EVERY nested heading, not one. The defect it guards was
    // per-row (a stripe above rows 2 and 3 while row 1 was clean), and `margin: 0` on `&__heading` is
    // now a universal rule — checking a single element would understate what the refactor established
    // and would pass on a regression that spared row 2. Same shape as the all-panels border loop above.
    const nestedHeadings = nestedPanels.locator('.lp-accordion__heading')
    const headingCount = await nestedHeadings.count()
    expect(headingCount).toBeGreaterThan(1)
    for (let i = 0; i < headingCount; i++) {
      await expect(nestedHeadings.nth(i)).toHaveCSS('margin-top', '0px')
    }

    // The open panel's header carries the divider that separates it from the body it now owns, driven
    // off `aria-expanded` rather than a class — so this also pins that there is no second source of
    // open/closed truth to drift from the attribute.
    await expect(
      page
        .locator(
          '.lp-admin-dash > .lp-accordion > * > .lp-accordion__trigger[aria-expanded="true"]',
        )
        .first(),
    ).toHaveCSS('border-bottom-width', '1px')
    // And a bordered list never closes with its own divider (that plus a section rule reads as a
    // table edge).
    //
    // ⚑ RE-ANCHORED IN PR 3. This read `.lp-admin-dash__actions li`, the "Curriculum & people" link
    // list, chosen because it was a flat <ul>; that panel became two real panels and the class is
    // gone.
    //
    // ⚑ AND A CORRECTION, because the first version of this note asserted the opposite: a `.last()`
    // matching nothing does NOT pass here. `toHaveCSS` resolves an element and times out when the
    // locator matches none, so the stale anchor would have failed LOUDLY — verified by running the
    // case rather than reasoning about it. It is `toHaveCount(0)` that passes on an empty locator; a
    // real rot risk, but not this assertion's. The re-anchor was needed, the alarming reason given
    // for it was wrong, and a wrong tooling fact in a comment this repo treats as canon is worse
    // than no comment.
    //
    // Unscoped by panel deliberately: `li:last-child { border-bottom: 0 }` belongs to the SHARED
    // `.lp-manage__list` idiom, and tying it to one consumer's namespace is what made the previous
    // anchor rot when that consumer went away.
    await expect(page.locator('.lp-manage__list li').last()).toHaveCSS('border-bottom-width', '0px')
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
    // Edit intent honoured: a prose textarea is editable for this Teacher's granted scope.
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
    test('a Teacher with editing access has their only section expanded', async ({ page }) => {
      // Their saved versions are the whole page — nobody should click to reveal their only panel.
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
      // ⚑ THE FOUR TOP-LEVEL BOXES, not the old six section headings. Three of those names
      // (`Subjects`, `Subject grades`, `Roles & Access`) are NESTED as of 2026-08-18, so they sit
      // inside a closed `[hidden]` panel — out of the accessibility tree entirely, which is why this
      // failed with "element(s) not found" rather than with the wrong attribute value. A hidden
      // control is not a collapsed control, and asserting `aria-expanded=false` on one asserts nothing.
      for (const name of ['Users', 'Curriculum', 'Lesson plans', 'Candidate versions']) {
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

      // Two TOP-LEVEL boxes, deliberately: this test is about `replaceState` and history depth, and
      // driving it through a nested panel would make it depend on the parent being open first.
      // (It used to use Roles & Access, which is nested as of 2026-08-18.)
      await openPanel(page, 'Curriculum')
      await expect(page).toHaveURL(/[?&]open=curriculum/)
      await openPanel(page, 'Lesson plans')
      await expect(page).toHaveURL(new RegExp(`[?&]open=curriculum${SEP}plans`))

      // ⚑ The point of `replaceState` (D7a): a reader who opened four panels must not have to press
      // Back four times to leave the page. `router.push` here would also re-run the dashboard server
      // component and its ~9 queries on every click.
      expect(await depth()).toBe(before)

      // …and closing removes it again rather than accumulating stale ids.
      await page.getByRole('button', { name: 'Curriculum', exact: true }).click()
      await expect(page).toHaveURL(/[?&]open=plans/)
      await expect(page).not.toHaveURL(/curriculum/)
      expect(await depth()).toBe(before)
    })

    test('open state survives a genuine reload', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      await openPanel(page, 'Curriculum')
      // A full page load is the case React state cannot survive and the reason the URL carries this
      // at all (D7).
      await page.reload()
      await expect(page.getByRole('button', { name: 'Curriculum', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
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
      // ⚑ The three ids are chosen to be one of each kind, and they were re-picked on 2026-08-18
      // because the regrouping changed which spelling is which: `curriculum` is now a real panel that
      // this caller cannot see (it was a retired id before), `nonsense` is unknown, and the valid one
      // is nested — so this also pins that a deep link opens a non-Site-Admin's ancestor for them.
      await page.goto(`${BASE}/admin?open=curriculum,nonsense,users.access&at=sg-999`)
      await expect(page.getByRole('heading', { name: 'Manage' })).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Roles & Access', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
      // The URL is rewritten to what the page is actually showing: the inaccessible id, the typo and
      // the consumed one-shot `at` are all gone, the valid one survives, and its ancestor is added.
      await expect(page).toHaveURL(new RegExp(`[?&]open=users${SEP}users\\.access(&|$)`))
      await expect(page).not.toHaveURL(/curriculum|nonsense|at=/)
    })

    test('the disclosure is operable from the keyboard', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin`)
      // A top-level box, so the test drives the disclosure itself rather than first having to open a
      // parent (Roles & Access became nested on 2026-08-18).
      const trigger = page.getByRole('button', { name: 'Curriculum', exact: true })
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

  test.describe('Users panel', () => {
    test('loads only when opened; disclosures preserve a draft and actions remain usable on mobile', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await loginAs(page, 'siteAdmin')
      const searches: string[] = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/users/search') searches.push(request.url())
      })

      await page.goto(`${BASE}/admin`)
      await expect(page.getByRole('button', { name: 'Users', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      // Negative assertions need to let the zero-delay lazy effect run. If the panel fetched merely
      // because it was mounted inside a hidden accordion, this pause observes it.
      await page.waitForTimeout(300)
      expect(searches).toHaveLength(0)

      // ⚑ TWO LAYERS SINCE 2026-08-18, and the intermediate state is the assertion worth having:
      // opening the GROUP must not fetch, because the panel itself is still collapsed. The lazy gate
      // keys on `users.accounts`; keying it on the parent would restore the eager fetch this test
      // exists to forbid, while every visible symptom stayed the same.
      await openPanel(page, 'Users')
      await page.waitForTimeout(300)
      expect(searches).toHaveLength(0)

      await openPanel(page, 'Accounts')
      const row = await openUser(page, MANAGE_USER_EMAIL)
      expect(searches.length).toBeGreaterThan(0)
      await expect(row.locator('.lp-users__summary-meta')).toContainText('Teacher')
      await expect(row.locator('.lp-users__grants')).toContainText(
        `Editing access · ${fx.subjectGrade.displayName}`,
      )
      await expect(row.locator('.lp-users__grants')).not.toContainText('Editor ·')
      const details = row.locator('.lp-users__details')
      await expect(details).toHaveCSS('display', 'grid')

      // Both disclosure layers stay mounted. A half-edited name survives a row close/reopen, while
      // the load-bearing `[hidden]` rule still wins over the visible grid declaration.
      const name = row.getByLabel('Display name')
      await name.fill(`${MANAGE_USER_NAME} draft`)
      await row.locator('.lp-users__summary').click()
      await expect(details).toBeHidden()
      await expect(details).toHaveCSS('display', 'none')
      await row.locator('.lp-users__summary').click()
      await expect(name).toHaveValue(`${MANAGE_USER_NAME} draft`)

      // D12: the simple management workflow is fully available on phones, with touch-sized stacked
      // controls and no page-level horizontal overflow.
      const geometry = await page.evaluate(() => {
        const action = document.querySelector<HTMLElement>(
          '.lp-users__details:not([hidden]) .lp-users__actions .btn',
        )
        const actions = document.querySelector<HTMLElement>(
          '.lp-users__details:not([hidden]) .lp-users__actions',
        )
        const actionRect = action?.getBoundingClientRect()
        const actionsRect = actions?.getBoundingClientRect()
        return {
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          actionHeight: actionRect?.height ?? 0,
          actionWidth: actionRect?.width ?? 0,
          actionsWidth: actionsRect?.width ?? 0,
        }
      })
      expect(geometry.overflow).toBeLessThanOrEqual(0)
      expect(geometry.actionHeight).toBeGreaterThanOrEqual(44)
      expect(geometry.actionWidth).toBeGreaterThanOrEqual(geometry.actionsWidth - 1)
    })

    test('row actions call the PR 2a account endpoints and show their resulting state', async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      // `users.accounts`, not `users`: the latter now opens only the GROUP, leaving this panel — and
      // the search box `openUser` types into — collapsed. The failure was `locator.fill` timing out.
      await page.goto(`${BASE}/admin?open=users.accounts`)

      let row = await openUser(page, MANAGE_USER_EMAIL)
      await row.getByLabel('Display name').fill(MANAGE_USER_RENAMED)
      await row.getByRole('button', { name: 'Save profile', exact: true }).click()
      await expect(row.locator('.lp-users__summary')).toContainText(MANAGE_USER_RENAMED)

      await row.getByRole('button', { name: 'Reveal reset link', exact: true }).click()
      await expect(row.getByLabel(/Password reset link/)).toHaveValue(/\/reset-password\?token=/)

      const grantPrompt = await acceptConfirmation(page, () =>
        row.getByRole('button', { name: 'Make Site Administrator', exact: true }).click(),
      )
      expect(grantPrompt).toContain(
        `Grant Site Administrator to ${MANAGE_USER_RENAMED} — ${MANAGE_USER_EMAIL}?`,
      )
      await expect(
        row.getByRole('button', { name: 'Remove Site Administrator', exact: true }),
      ).toBeVisible()
      await expect(row.locator('.lp-users__summary-meta')).toContainText('Site administrator')

      const revokePrompt = await acceptConfirmation(page, () =>
        row.getByRole('button', { name: 'Remove Site Administrator', exact: true }).click(),
      )
      expect(revokePrompt).toContain(
        `Remove Site Administrator from ${MANAGE_USER_RENAMED} — ${MANAGE_USER_EMAIL}?`,
      )
      await expect(
        row.getByRole('button', { name: 'Make Site Administrator', exact: true }),
      ).toBeVisible()
      await expect(row.locator('.lp-users__summary-meta')).toContainText('Teacher')

      const disablePrompt = await acceptConfirmation(page, () =>
        row.getByRole('button', { name: 'Disable sign-in', exact: true }).click(),
      )
      expect(disablePrompt).toContain(
        `Disable sign-in for ${MANAGE_USER_RENAMED} — ${MANAGE_USER_EMAIL}?`,
      )
      expect(disablePrompt).toContain('Every live session will end immediately.')
      await expect(row.locator('.lp-users__summary-meta')).toContainText('Sign-in disabled')
      await expect(row.getByRole('button', { name: 'Reveal reset link', exact: true })).toHaveCount(
        0,
      )

      await acceptConfirmation(page, () =>
        row.getByRole('button', { name: 'Enable sign-in', exact: true }).click(),
      )
      await expect(row.getByRole('button', { name: 'Disable sign-in', exact: true })).toBeVisible()
      await expect(row.locator('.lp-users__summary-meta')).not.toContainText('Sign-in disabled')

      row = await openUser(page, UNVERIFIED_USER_EMAIL)
      await expect(row.locator('.lp-users__summary-meta')).toContainText('Unverified')
      await row.getByRole('button', { name: 'Mark verified', exact: true }).click()
      await expect(row.locator('.lp-users__summary-meta')).not.toContainText('Unverified')
      await expect(row.getByRole('button', { name: 'Mark verified', exact: true })).toHaveCount(0)

      row = await openUser(page, DELETE_USER_EMAIL)
      const deletePrompt = await acceptConfirmation(page, () =>
        row.getByRole('button', { name: 'Delete account', exact: true }).click(),
      )
      // `personLabel`'s em-dash form — the SAME string the Editing-access widget's remove dialog uses
      // on this page. The panel shipped with its own `Name (email)` spelling, and this assertion was
      // what held the fork in place.
      expect(deletePrompt).toContain(`Delete ${DELETE_USER_NAME} — ${DELETE_USER_EMAIL}?`)
      expect(deletePrompt).toContain('authored 0 versions; 0 are currently Official.')
      expect(deletePrompt).toContain('their author attribution becomes unknown')
      expect(deletePrompt).toContain('Messages, favorites and edit-recovery rows are deleted')
      expect(deletePrompt).toContain('This cannot be undone.')
      await expect(row).toHaveCount(0)
    })

    test('a grant jumps to its access group as exactly one reversible history entry', async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=users.accounts`)
      const row = await openUser(page, fx.users.editor.email)
      const before = await page.evaluate(() => window.history.length)

      await row.getByRole('button', { name: 'Open access controls', exact: true }).click()
      // The jump ADDS `users.access` to what was already open (`users` + `users.accounts`), and the
      // whole set is serialised in render order — not just the jump target.
      await expect(page).toHaveURL(
        new RegExp(`[?&]open=users${SEP}users\\.accounts${SEP}users\\.access`),
      )
      await expect(page).not.toHaveURL(/[?&]at=/)
      await expect(
        page.getByRole('button', { name: 'Roles & Access', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator(`#sg-${fx.subjectGrade.id}`)).toBeFocused()
      expect(await page.evaluate(() => window.history.length)).toBe(before + 1)

      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`[?&]open=users${SEP}users\\.accounts(&|$)`))
      await expect(page.getByRole('button', { name: 'Users', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      await expect(
        page.getByRole('button', { name: 'Roles & Access', exact: true }),
      ).toHaveAttribute('aria-expanded', 'false')
    })
  })

  /**
   * PR 4 / D6a — who may change a Subject Administrator, and what everyone else is shown.
   *
   * ⚑ THE SERVER TEST IS NOT THIS ONE. `tests/http/userAssignments.http.spec.ts` proves the boundary
   * holds at the wire. What THIS proves is the other half the decision asks for — that the UI invites
   * exactly what the server permits, no more and no less. A guard that refuses the write while the UI
   * still offers the control produces an administrator who clicks, sees an error, and concludes the app
   * is broken; the same principle in reverse says a rule the server now permits must have a control,
   * or nobody can use it. That is "explain, don't just remove", as D12 applies it to phone editing.
   *
   * ⚑ AMENDED 2026-08-19, and the amendment moved the line rather than erasing it: appointing is now a
   * HANDOVER a Subject Administrator may perform (to an existing editor of that subject-grade), while
   * REMOVING an administrator stays Site-Admin-only. So this describe asserts one control present and
   * one absent for the same viewer, which is the whole shape of the decision.
   */
  test.describe('Roles & Access — the Subject Administrator control (D6a)', () => {
    test('a Subject Administrator may hand administration over, but not remove it', async ({
      page,
    }) => {
      await loginAs(page, 'subjectAdmin')
      await page.goto(`${BASE}/admin?open=users.access`)

      // The FACT is shown — scoped information they already effectively hold.
      const group = page.locator('.lp-manage__editors-group').first()
      await expect(group.getByText('Subject Administrator')).toBeVisible()

      // ⚑ THE LABEL MUST BE STYLED, not merely present. `lp-manage__roles-admin` once shipped with no
      // CSS rule at all: the row rendered as an unstyled pile and the only assertion on it checked
      // that its text was VISIBLE, which passes on unstyled markup. `lp-manage__roles-label` is new
      // in the same file, so it gets the assertion that failure taught — a computed value only a real
      // rule can produce. 600 is the weight; the browser reports it numerically.
      const rolesLabel = group.locator('.lp-manage__roles-label').first()
      await expect(rolesLabel).toHaveCSS('font-weight', '600')
      await expect(rolesLabel).toHaveCSS('font-size', '14px')

      // Both blocks are named — that pairing is what stops the administrator row reading as a header
      // for the editor rows beneath it (2026-08-19).
      await expect(group.locator('.lp-manage__roles-label')).toHaveCount(2)

      // ⚑ THE CONTROL THAT REMOVES AN ADMINISTRATOR DOES NOT EXIST for them — neither the Site
      // Admin's appoint/replace picker nor any remove button. Asserted as absence rather than
      // disabled-ness: a disabled control still invites the click D6a is trying to prevent.
      await expect(
        page.getByRole('combobox', { name: /Appoint the Subject Administrator/ }),
      ).toHaveCount(0)
      await expect(page.getByRole('button', { name: /as Subject Administrator of/ })).toHaveCount(0)

      // ⚑ AND THE ONE THAT HANDS IT OVER DOES (amended D6a). The fixture puts an editing-access
      // holder on this subject-grade, so there is an eligible successor and the picker renders; a
      // subject-grade with no editors gets the explanatory line instead, which
      // `tests/unit/rolesAccessPanel.spec.tsx` covers without a browser.
      const handover = group.getByRole('combobox', { name: /Hand over administration of/ })
      await expect(handover).toBeVisible()
      await expect(group.getByRole('button', { name: /Hand over administration of/ })).toBeVisible()

      // ⚑ THE POOL, not just the presence — the server permits a handover only to somebody who already
      // holds editing access here, so a picker offering the whole roster would 403 on most choices.
      //
      // ⚑ BY IDENTITY, NOT BY COUNT. The first draft of this asserted `toHaveCount(2)`, which is the
      // mistake recorded 30 lines below in the subject-grade delete test: "the first draft asserted
      // '1 person loses editing access' and CI returned '2 people lose…' — the FEATURE was right and
      // the assertion was counting fixtures." How many accounts the fixture happens to seed with a
      // grant is not the property. Who is ELIGIBLE is: the fixture's editor holds editing access here
      // and must be offered; its teacher holds nothing anywhere and must not be, even though the Site
      // Admin's own picker lists them.
      const offered = (await handover.locator('option').allTextContents()).join(' ')
      expect(offered).toContain(fx.users.editor.email)
      expect(offered).not.toContain(fx.users.teacher.email)

      // Their editing-access controls are untouched — the guard is narrow, and this is where that
      // is visible to a person rather than to a test client.
      await expect(page.getByRole('combobox', { name: /Grant editing access for/ })).toHaveCount(1)
    })

    test('a Site Administrator gets the picker and the remove control', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=users.access`)

      await expect(
        page.getByRole('combobox', { name: /Appoint the Subject Administrator/ }).first(),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: /as Subject Administrator of/ }).first(),
      ).toBeVisible()
    })
  })

  /**
   * Manage → System (2026-08-21). The panel is Site-Admin-only and reports boot-time facts.
   *
   * ⚑ THIS EXISTS FOR THE COMPUTED VALUES, not the text. `lp-manage__roles-admin` once shipped with no
   * CSS rule at all and the only assertion on it checked that its text was VISIBLE — which passes on
   * unstyled markup, so nothing caught it. The `data-status` colouring carries real meaning here (an
   * `unknown` row is the operator's cue that something is down), and it is exactly the kind of rule
   * that fails silently: `--theme-warning-500` does not exist in Payload's tokens, and an undefined
   * custom property INHERITS rather than erroring, so a wrong token would have made `unknown` look
   * identical to `off`.
   */
  test.describe('Manage → System', () => {
    test('a Site Administrator sees the deployment facts, with the status colours applied', async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=system.deployment`)

      const values = page.locator('.lp-manage__fact-value')
      await expect(values.first()).toBeVisible()
      // Every fact names the env var that decides it — the whole point of a read-only half.
      await expect(page.locator('.lp-manage__who-email').first()).toBeVisible()

      // ⚑ A COMPUTED COLOUR, and one that must DIFFER from the muted default. Asserting a specific
      // rgb() would pin Payload's palette; asserting difference pins the thing that actually breaks —
      // a rule that does not apply, or a token that does not resolve.
      const muted = await page
        .locator('.lp-manage__fact-value[data-status="off"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color)
        .catch(() => null)
      const flagged = await page
        .locator('.lp-manage__fact-value[data-status="unknown"]')
        .first()
        .evaluate((el) => getComputedStyle(el).color)
        .catch(() => null)
      // On a stack with no SERVER_URL/SMTP/Sentry and no Gotenberg both are present; if a future
      // fixture configures everything, neither is, and there is nothing to compare — skip rather than
      // assert something vacuous.
      if (muted && flagged) expect(flagged).not.toBe(muted)

      // The detail line claims a full row rather than relying on wrapping (see custom.scss).
      const detail = page.locator('.lp-manage__fact-detail').first()
      await expect(detail).toHaveCSS('flex-basis', '100%')
    })

    test('a Subject Administrator has no System box, and the deep link is scrubbed', async ({
      page,
    }) => {
      await loginAs(page, 'subjectAdmin')
      await page.goto(`${BASE}/admin?open=system.deployment`)

      await expect(page.locator('.lp-manage__fact-value')).toHaveCount(0)
      // D7a: a role-inaccessible id is dropped silently AND scrubbed from the URL, landing them on
      // their own panel rather than an error or an empty box.
      await expect(page).toHaveURL(/open=users(%2C|,)users\.access/)
    })
  })

  /**
   * PR 3 — the taxonomy panels. The SERVER side of both guards is already covered by
   * `tests/int/taxonomyDelete.int.spec.ts`; what is untested until here is whether their messages
   * ever reach a human. That is the entire premise of these panels: the design doc specifies
   * "surface the existing 409 guard messages rather than implementing new guards", and a panel that
   * collapsed a 409 into "Delete failed" would leave the guards working and useless.
   */
  test.describe('Taxonomy panels', () => {
    test("a blocked delete shows the guard's own message, and the confirm names the cascade", async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=curriculum.subject-grades`)

      // ⚑ LOCATED BY THE DELETE CONTROL'S ACCESSIBLE NAME, not by row text. These rows identify
      // themselves through input VALUES and <option> text, and `hasText` matches neither the way it
      // looks like it does — the first draft of this locator matched by accident, or not at all.
      const remove = page.getByRole('button', { name: `Delete ${MARK}Biology — Grade 99` })
      await expect(remove).toBeVisible()

      /**
       * ⚑ THE CONFIRMATION NAMES WHAT THE DELETE WOULD TAKE AWAY. `guardSubjectGradeDelete` blocks on
       * lesson plans, but role assignments do NOT block it — they are cascaded away silently. The
       * fixture puts exactly one editing-access holder and one Subject Administrator on this
       * subject-grade, so both halves of the sentence are exercised, and asserting the text is what
       * stops the warning being quietly dropped later (it costs a query, which is what gets removed
       * when nothing is watching).
       */
      const prompt = await acceptConfirmation(page, () => remove.click())
      // ⚑ STRUCTURE, NOT A CENSUS. The first draft asserted "1 person loses editing access" and CI
      // returned "2 people lose…" — the FEATURE was right and the assertion was counting fixtures.
      // How many accounts this spec happens to seed with a grant is not what the warning is for, and
      // pinning it means any future fixture breaks a test about a sentence. The pluralisation itself
      // is pinned properly in tests/unit/subjectGradeDelete.spec.ts, where it is a pure function.
      // Shape only. The unit spec owns the grammar (tests/unit/subjectGradeDelete.spec.ts); a regex
      // here would restate logic that is already pinned against a pure function.
      expect(prompt).toContain('editing access')
      expect(prompt).toContain('demoted')
      expect(prompt).toContain('This cannot be undone.')

      // The delete then FAILS on the content guard, and its 409 text — not a generic failure — is
      // what the panel renders. `Manage → Delete lesson plans` is the actionable part of that
      // message and the reason surfacing it verbatim matters.
      const error = page.locator('.lp-taxonomy .lp-manage__error')
      await expect(error).toContainText('still use this subject grade')
      await expect(error).toContainText('Manage → Delete lesson plans')
      // Still there: a refused delete must not look like a successful one.
      await expect(remove).toBeVisible()
    })

    test('a duplicate subject grade shows the friendly message, not an opaque failure', async ({
      page,
    }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=curriculum.subject-grades`)

      /**
       * The `beforeValidate` duplicate check exists ONLY to replace an opaque failure with a readable
       * one, and for its whole life it produced an opaque failure of its own — it threw a bare `Error`,
       * which Payload renders as a 500 "Something went wrong." (fixed 2026-08-03; see the ⚑ in
       * SubjectGrade.ts). This asserts the readable message actually lands in the panel, which is the
       * only place that regression would ever be visible again.
       */
      // ⚑ BY NAME, not `.first()`. Both taxonomy panels stay MOUNTED while collapsed, so `.first()`
      // resolved to the Subjects panel's create form — hidden, so the action timed out after 30s
      // against an element that was never the intended one.
      const create = page.getByRole('form', { name: 'Add a subject grade' })
      await create.getByLabel('Subject').selectOption({ label: `${MARK}Biology` })
      await create.getByLabel('Grade').fill('99')
      await create.getByRole('button', { name: 'Add subject grade' }).click()

      await expect(page.locator('.lp-taxonomy .lp-manage__error')).toContainText(
        'Grade 99 already exists for that subject.',
      )
      // The typed values survive the refusal — retyping a rejected value to read its message again is
      // how a refusal starts reading like a broken page.
      await expect(create.getByLabel('Grade')).toHaveValue('99')
    })

    test('a subject that still has grades cannot be deleted, and says why', async ({ page }) => {
      await loginAs(page, 'siteAdmin')
      await page.goto(`${BASE}/admin?open=curriculum.subjects`)

      const remove = page.getByRole('button', { name: `Delete ${MARK}Biology`, exact: true })
      await expect(remove).toBeVisible()
      // No cascade warning here, and the asymmetry with subject grades is deliberate: a Subject with
      // grades cannot be deleted at all, so there is nothing silent to warn about.
      await acceptConfirmation(page, () => remove.click())
      await expect(page.locator('.lp-taxonomy .lp-manage__error')).toContainText(
        'still belong to this subject',
      )
      await expect(remove).toBeVisible()
    })
  })

  /**
   * D4 — display-name editing lives in the avatar menu, not a "My Account" accordion: Manage is
   * unreachable by plain Teachers, so account self-service placed there would be invisible to most
   * users. Driven here as a Teacher with editing access to prove it is not Site-Admin-only.
   */
  test('a user can change their own display name from the avatar menu', async ({ page }) => {
    await loginAs(page, 'editor')
    await page.goto(`${BASE}/admin`)

    // ⚑ WAIT FOR THE ACCORDION'S MOUNT SCRUB BEFORE TOUCHING THE MENU, and note that this role is the
    // only one that has a scrub to wait for. `initialOpen` auto-opens the sole top-level panel when a
    // role has exactly one, and a Teacher with editing access sees only "My saved versions" — so a
    // bare `/admin` rewrites the address bar to `?open=versions` shortly after load, while a Site
    // Admin (several panels) gets `[]` and no rewrite at all.
    //
    // Playwright counts that `history.replaceState` as a navigation. Clicking the avatar menu inside
    // the window where it lands tore the dropdown's client state down mid-interaction, and the
    // 'Change display name' button never reappeared: 30s timeout, on the merge-to-main run for #239
    // (`01417e4`) — green on that PR's own run minutes earlier, which is how a timing race presents.
    //
    // This asserts the product's intended behaviour rather than sleeping through it: the URL SHOULD
    // become `?open=versions` for this role, so waiting for it is both the fix and a check.
    await expect(page).toHaveURL(/[?&]open=versions/)

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
