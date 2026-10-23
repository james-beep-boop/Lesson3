/**
 * Manage's accordion, driven from a browser spec. Shared by `manage.e2e.spec.ts` and
 * `drafts.e2e.spec.ts` (/simplify, 2026-10-23: the region lookup had five inline copies). Imports only
 * Playwright, like `helpers/login.ts`.
 */
import { expect, type Locator, type Page } from '@playwright/test'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A panel's disclosure button by its title. A trailing count is allowed ("Your drafts (2)",
 * Proposal B), so callers name the panel, not today's number.
 */
export const panelTrigger = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: new RegExp(`^${escape(name)}( \\(\\d+\\))?$`) })

/**
 * Open one disclosure panel by its heading (the accordion redesign, D7).
 *
 * ⚑ Sections are COLLAPSED by default for any role that sees more than one of them, so a test that
 * wants a panel's contents must say so. That is a deliberate behaviour change, not a regression: the
 * operator's brief was that Manage grows long and unwieldy.
 *
 * Idempotent, and it asserts the post-condition rather than assuming the click landed — a disclosure
 * that silently failed to open would otherwise surface as a confusing failure in the assertion after
 * it, several lines from the cause.
 */
export async function openPanel(page: Page, name: string): Promise<void> {
  const trigger = panelTrigger(page, name)
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

/**
 * A panel's OWN region, via `aria-controls` on its trigger.
 *
 * ⚑ NOT A `section` FILTER. `locator('section.lp-accordion').filter({ has: <this panel's button> })`
 * also matches the ANCESTOR section once a panel is nested, so a count silently picks up sibling
 * panels' lists. `aria-controls` cannot match an ancestor.
 */
export async function panelRegion(page: Page, name: string): Promise<Locator> {
  const id = await panelTrigger(page, name).getAttribute('aria-controls')
  expect(id, `the "${name}" trigger must control a region`).toBeTruthy()
  return page.locator(`[id="${id}"]`)
}
