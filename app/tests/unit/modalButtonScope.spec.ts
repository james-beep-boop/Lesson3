/**
 * Every admin dialog button must opt into the app's button system with `lp-btn`.
 *
 * ⚑ THE DEFECT THIS EXISTS FOR, and it is a trap the portal fix (#289) created without anyone
 * noticing. The admin button system is:
 *
 *     .collection-edit--lesson-bundle-versions .lesson-controls-wrap .btn,
 *     .btn.lp-btn { … }
 *
 * — a CONTAINER scope for the version editor's control bar, plus an opt-in class for everything else.
 * While dialogs rendered in place, their buttons sat inside `.lesson-controls-wrap` and were styled by
 * the container scope for free. `createPortal` to `document.body` moved them out of that ancestry, so
 * the free ride ended silently: no error, no failing test, just Payload's default treatment instead of
 * the app's geometry, colours and focus ring. `Discard the changes` rendered with a transparent
 * background, a transparent border and black ink — visually a label, not a button. Found on a
 * screenshot, twice, after review had passed both times.
 *
 * ⚑ The control-bar buttons are deliberately NOT required to carry it: they are still inside
 * `.lesson-controls-wrap`, so the container scope still styles them, and adding the class there would
 * be redundant. (A handoff note briefly claimed the opposite about the view-mode `Delete` button —
 * corrected 2026-08-23. The portal moved the DIALOGS, not the bar.)
 *
 * ⚑ FRONTEND dialogs are out of scope on purpose: `(frontend)/styles.css` styles a bare `.btn`
 * globally, so no ancestry can be escaped and no opt-in is needed there.
 *
 * Source-level rather than a render: the point is to catch the NEXT dialog someone writes, and a
 * render test only covers the dialogs somebody remembered to render.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ADMIN_COMPONENTS = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/components')

/** Every `.tsx` under `src/components`, recursively. */
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    return e.isDirectory() ? sources(p) : e.name.endsWith('.tsx') ? [p] : []
  })

/**
 * The regions of `src` between `<Modal` and its matching `</Modal>`.
 *
 * Nesting is not handled because a modal inside a modal is not a thing this app does; if it ever
 * becomes one, this returns a wider region and over-reports, which fails loudly rather than silently
 * passing — the safe direction for a guard.
 */
const modalRegions = (src: string): string[] => {
  const out: string[] = []
  let from = 0
  for (;;) {
    const open = src.indexOf('<Modal', from)
    if (open === -1) break
    const close = src.indexOf('</Modal>', open)
    if (close === -1) break
    out.push(src.slice(open, close))
    from = close + 1
  }
  return out
}

/** The opening tags of every `<Button …>` in a region, multi-line ones included. */
const buttonTags = (region: string): string[] => {
  const out: string[] = []
  let from = 0
  for (;;) {
    const open = region.indexOf('<Button', from)
    if (open === -1) break
    const end = region.indexOf('>', open)
    if (end === -1) break
    out.push(region.slice(open, end + 1))
    from = end + 1
  }
  return out
}

describe('admin dialog buttons opt into the app button system', () => {
  const files = sources(ADMIN_COMPONENTS).filter((f) => readFileSync(f, 'utf8').includes('<Modal'))

  it('finds the dialogs at all, so this cannot pass by scanning nothing', () => {
    // The failure mode a source-scanning test is prone to: a moved directory turns it into a no-op
    // that reports success. Three components render the shared Modal on the admin surface today.
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it('requires className="lp-btn" on every Button inside a Modal', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const region of modalRegions(src)) {
        for (const tag of buttonTags(region)) {
          if (!/className=(["'])lp-btn\1/.test(tag)) {
            const label = tag.replace(/\s+/g, ' ').slice(0, 70)
            offenders.push(`${relative(ADMIN_COMPONENTS, file)}: ${label}`)
          }
        }
      }
    }
    expect(
      offenders,
      'a portalled dialog escapes the .lesson-controls-wrap container scope, so its buttons must ' +
        'carry lp-btn or they fall back to Payload styling',
    ).toEqual([])
  })
})
