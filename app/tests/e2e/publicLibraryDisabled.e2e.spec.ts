/**
 * Public discovery is OFF by default, and off means ABSENT (SPEC §2;
 * `docs/DESIGN-public-library.md`; the switch is `src/lib/publicLibrary.ts`).
 *
 * This is the shape an offline school installation runs, and it is also the shape every existing
 * deployment keeps until an operator opts in — so it is the mode that must not regress. The e2e
 * server runs without `PUBLIC_LIBRARY_ENABLED`, which makes this the default-mode case.
 *
 * ⚑ THE 404 IS THE ASSERTION THAT MATTERS. The missing link is presentation; a hidden button still
 * serves its URL to anyone who types it. If a future refactor moves the gate into a layout, or a new
 * public route forgets to call it, THIS is what should go red — so the route check is written to
 * exercise the URL directly rather than to click the (absent) link.
 *
 * ⚑ WHAT THIS FILE DOES NOT COVER: the ENABLED mode. A second browser mode needs a second Playwright
 * server started with the flag set, and there is no public content to assert against until the read
 * slice lands. Enabled-mode behaviour is currently held by `tests/unit/publicLibrary.spec.ts` (the
 * switch and the boot refusal, including the mutation-checked "only the literal 1 counts" cases) and
 * by browser verification recorded in the PR. Do not read a green run here as evidence that the
 * public library works — only that it is absent when it should be.
 *
 * Runs like the other e2e specs — see `manage.e2e.spec.ts`'s header.
 */
import { test, expect } from '@playwright/test'

import { E2E_BASE } from '../helpers/e2e'

test.describe('Public discovery disabled (the default and offline deployment shape)', () => {
  test('/explore is not served at all', async ({ page }) => {
    const response = await page.goto(`${E2E_BASE}/explore`)

    // A soft 200 rendering an empty shell would be a silent publication surface, so the contract is
    // a real 404 FROM THE SERVER — and the status is the whole of it.
    //
    // ⚑ Deliberately no assertion about the 404 page's body. One was written and removed: Next's
    // `_not-found` shell is prerendered at build time, carries no CSP nonce, and therefore renders
    // unhydrated on a direct load (a known, accepted caveat — see `src/middleware.ts`). Asserting on
    // its markup couples this spec to Next's internals and to that quirk, and would go red on a
    // framework upgrade that changes neither the boundary nor anything a user experiences.
    expect(response?.status(), '/explore must 404 when public discovery is disabled').toBe(404)

    // What DOES matter about the body: none of the page we would have served leaked into it.
    await expect(page.getByRole('heading', { name: /free cbe lesson plans/i })).toHaveCount(0)
  })

  test('the sign-in page offers no route into a public library', async ({ page }) => {
    await page.goto(`${E2E_BASE}/login`)

    // The restrained front door is still fully itself — this is not a page that merely lost a link.
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible()

    await expect(
      page.getByRole('link', { name: /explore free lesson plans/i }),
      'the Explore action must be absent when public discovery is disabled',
    ).toHaveCount(0)
  })
})
