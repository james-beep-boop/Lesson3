/**
 * Geometry of a two-button confirmation (`.modal__actions--pair`, operator decision 2026-10-22):
 * Cancel first, two equal buttons, both inside the row and the dialog. Imports only Playwright, like
 * `helpers/login.ts`, so any browser spec can use it.
 *
 * ⚑ EQUAL WIDTHS ALONE ARE NOT ENOUGH. #433 shipped an admin Delete with an extra 8px left margin:
 * the two widths still matched, but Delete ran past the row's right edge (Codex review). So each
 * button is checked against the row's edges, and the gap between them against the row's own.
 */
import { expect, type Locator, type Page } from '@playwright/test'

/** Sub-pixel slack for layout rounding. */
const SLACK = 1

export async function expectPairedActions(dialog: Locator, action: string): Promise<void> {
  const row = dialog.locator('.modal__actions--pair')
  const [panel, rowBox, cancel, confirm] = await Promise.all([
    dialog.boundingBox(),
    row.boundingBox(),
    row.getByRole('button', { name: 'Cancel', exact: true }).boundingBox(),
    row.getByRole('button', { name: action, exact: true }).boundingBox(),
  ])
  if (!panel || !rowBox || !cancel || !confirm)
    throw new Error(`paired row for "${action}" not laid out`)

  // Cancel first, then the action.
  expect(cancel.x).toBeLessThan(confirm.x)
  // Equal widths.
  expect(Math.abs(cancel.width - confirm.width)).toBeLessThan(SLACK)
  // Spanning the row: Cancel starts at its left edge, the action ends at its right edge.
  expect(Math.abs(cancel.x - rowBox.x)).toBeLessThan(SLACK)
  expect(Math.abs(confirm.x + confirm.width - (rowBox.x + rowBox.width))).toBeLessThan(SLACK)
  // A real gap, no overlap, and no stray margin widening it.
  const gap = confirm.x - (cancel.x + cancel.width)
  expect(gap).toBeGreaterThan(0)
  expect(gap).toBeLessThan(20)
  // The row sits inside the dialog with a margin on both sides.
  expect(rowBox.x).toBeGreaterThan(panel.x)
  expect(rowBox.x + rowBox.width).toBeLessThan(panel.x + panel.width)
}

/**
 * The same check at desktop width and at 360px, with a screenshot of each for review by eye, then
 * back to desktop. `shot` names the file for each width (`'desktop'` / `'mobile'`).
 */
export async function expectPairedAtBothWidths(
  page: Page,
  dialog: Locator,
  action: string,
  shot: (width: 'desktop' | 'mobile') => string,
): Promise<void> {
  for (const [width, viewport] of [
    ['desktop', { width: 1280, height: 720 }],
    ['mobile', { width: 360, height: 780 }],
  ] as const) {
    await page.setViewportSize(viewport)
    await expectPairedActions(dialog, action)
    await page.screenshot({ path: shot(width) })
  }
  await page.setViewportSize({ width: 1280, height: 720 })
}
