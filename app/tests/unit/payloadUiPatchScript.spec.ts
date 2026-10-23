/**
 * The postinstall patch to Payload's admin bundle (scripts/patch-payload-ui.mjs;
 * docs/PLAN-editing-typing-speed-2026-10-23.md §4.4 and §5 part 1).
 *
 * Two halves. The script's rules are pinned against small fixture strings, so a refusal path is
 * proven without a broken bundle. Then the INSTALLED bundle must carry each exact patched text once
 * and neither original: a skipped `postinstall` (including one skipped by `ignore-scripts`) fails
 * here rather than shipping an unpatched, slow edit page.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_TARGET,
  NAME_CHECKS,
  PATCHES,
  patchSource,
} from '../../scripts/patch-payload-ui.mjs'

const [ucs, rowlabel] = PATCHES as [(typeof PATCHES)[0], (typeof PATCHES)[0]]

/** A stand-in bundle: every name check once, then both originals, with filler between. */
const fixture = (...parts: string[]) => [...NAME_CHECKS, ...parts].join('\n/* … */\n')
const pristine = fixture(ucs.from, rowlabel.from)
const patched = fixture(ucs.to, rowlabel.to)

describe('patch-payload-ui: the rules', () => {
  it('applies both patches to a pristine bundle', () => {
    const { source, applied } = patchSource(pristine)
    expect(applied).toEqual(['ucs', 'rowlabel'])
    expect(source).toBe(patched)
  })

  it('is a no-op on a bundle it already patched', () => {
    const { source, applied } = patchSource(patched)
    expect(applied).toEqual([])
    expect(source).toBe(patched)
  })

  it('refuses when an original is missing, so a moved bundle fails the install', () => {
    expect(() => patchSource(fixture(rowlabel.from))).toThrow(/ucs: expected the original once/)
  })

  it('refuses when an original appears twice', () => {
    expect(() => patchSource(fixture(ucs.from, ucs.from, rowlabel.from))).toThrow(
      /ucs: expected the original once or the patch once; found 2\/0/,
    )
  })

  it.each(NAME_CHECKS.map((check, i) => [i, check]))(
    'refuses when name check %i is absent or doubled',
    (i, check) => {
      const without = [ucs.from, rowlabel.from, ...NAME_CHECKS.filter((_, j) => j !== i)].join('\n')
      expect(() => patchSource(without)).toThrow(/name check expected once, found 0/)
      expect(() => patchSource(`${pristine}\n${check}`)).toThrow(
        /name check expected once, found 2/,
      )
    },
  )

  it('refuses a half-patched bundle', () => {
    expect(() => patchSource(fixture(ucs.to, rowlabel.from))).toThrow(/partially patched/)
  })

  it('refuses a marker without the exact patched text (an older or damaged revision)', () => {
    const older = `${ucs.marker}let R=Ub(null);return l[1]}`
    expect(() => patchSource(fixture(older, rowlabel.to))).toThrow(
      /ucs: marker present without the exact patched text/,
    )
    expect(() => patchSource(fixture(`${ucs.marker}${ucs.from}`, rowlabel.from))).toThrow(
      /ucs: marker present but patch not applied/,
    )
  })

  it('every replacement carries its marker', () => {
    for (const p of PATCHES) expect(p.to).toContain(p.marker)
  })
})

describe('patch-payload-ui: the installed bundle', () => {
  const bundle = readFileSync(DEFAULT_TARGET, 'utf8')

  it.each(PATCHES.map((p) => [p.name, p]))(
    '%s: the exact patched text is present once and the original is gone',
    (_, p) => {
      expect(bundle.split(p.to).length - 1).toBe(1)
      expect(bundle.includes(p.from)).toBe(false)
    },
  )

  it('the name checks still hold, so the patched code means what it was written to mean', () => {
    for (const check of NAME_CHECKS) expect(bundle.split(check).length - 1).toBe(1)
  })
})
