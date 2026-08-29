// @vitest-environment jsdom
/**
 * The edit-recovery indicator — that it stays SAYABLE and stays ON SCREEN.
 *
 * ⚑ WHY THIS EXISTS. The indicator carried two different kinds of text stacked in the control bar's
 * flex row: the live status ("Unsaved changes will be backed up" → "backed up · 12 s ago" → "NOT
 * backed up: could not reach the server") and, for admins, a STATIC rule that never changed ("Prose
 * only — structural changes and answer keys are not backed up"). Two lines with no width of their own
 * to defend collapsed to one word per line at intermediate widths — a column of vertical text wedged
 * between Cancel and Insert link (reported 2026-08-23).
 *
 * The static rule moved to *Help*. What must NOT move is the live status: `Indicator.tsx`
 * says "the timestamp IS the contract… a promise the user cannot verify is worth nothing", and the
 * ≤640px note says the moment a teacher most needs to know their work is safe is the moment the
 * layout collapses around them. Nothing guarded either claim, so a later tidy-up could quietly put
 * the failure text behind a dialog or a `display: none` and no test would notice.
 *
 * Two halves, deliberately in one file because they pin one decision:
 *   - the COMPONENT still speaks every outcome as visible text;
 *   - the STYLESHEET still gives it a row, and still never hides it.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import React from 'react'
import postcss from 'postcss'
import * as sass from 'sass'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EditRecoveryIndicator } from '@/components/EditRecovery/Indicator'
import type { RecoveryStatus } from '@/components/EditRecovery/protocol'

afterEach(cleanup)

const textFor = (status: RecoveryStatus): string => {
  cleanup()
  render(<EditRecoveryIndicator status={status} />)
  return screen.getByRole('status').textContent ?? ''
}

describe('every outcome is visible TEXT, not a colour', () => {
  // ⚑ Colour is not the only signal: a teacher with a colour-vision deficiency, or a monochrome
  // classroom projector, must get the same information. Each of these asserts the words.
  it('says work will be backed up before the first capture lands', () => {
    expect(textFor({ kind: 'idle' })).toMatch(/will be backed up/i)
  })

  it('says so, and when, once a capture has landed', () => {
    expect(textFor({ kind: 'backedUp', at: Date.now() })).toMatch(/backed up/i)
  })

  it('says NOT backed up on every failure kind, and names the reason', () => {
    expect(textFor({ kind: 'notBackedUp', reason: 'tooLarge' })).toMatch(/not backed up/i)
    expect(textFor({ kind: 'notBackedUp', reason: 'transport' })).toMatch(/not backed up/i)
    expect(textFor({ kind: 'notBackedUp', reason: 'rateLimited' })).toMatch(/not backed up/i)
    // The transport failure in particular must not read as reassurance.
    expect(textFor({ kind: 'notBackedUp', reason: 'transport' })).not.toMatch(/will be backed up/i)
  })

  it('is a polite live region, so it never interrupts a screen reader mid-sentence', () => {
    render(<EditRecoveryIndicator status={{ kind: 'idle' }} />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
  })
})

describe('the static prose-only rule is no longer stacked in the bar', () => {
  it('renders one line, with the rule moved to Help', () => {
    // The whole point of the split: the block is a single line of live status. If the rule comes
    // back here, the two-line collapse comes back with it.
    for (const status of [
      { kind: 'idle' },
      { kind: 'backedUp', at: Date.now() },
      { kind: 'notBackedUp', reason: 'transport' },
    ] as RecoveryStatus[]) {
      expect(textFor(status)).not.toMatch(/prose only|answer keys/i)
    }
  })
})

// ── The stylesheet half ──────────────────────────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url))
const adminCss = sass.compile(resolve(here, '../../src/app/(payload)/custom.scss')).css
const rules: { selectors: string[]; body: string; media: string | null }[] = []
postcss.parse(adminCss).walkRules((r) => {
  const parent = r.parent as { type?: string; params?: string } | undefined
  rules.push({
    selectors: r.selectors.map((s) => s.replace(/\s+/g, ' ').trim()),
    body: r.nodes.map((d) => d.toString()).join(';'),
    media: parent?.type === 'atrule' ? (parent.params ?? null) : null,
  })
})
const recoveryRules = rules.filter((r) => r.selectors.some((s) => s.includes('.lp-recovery')))

describe('the stylesheet gives it a row of its own, and never hides it', () => {
  it('claims the full row at BASE width, not only under a breakpoint', () => {
    // The defect: `flex-basis: 100%` lived only in the ≤640px block, so between that width and one
    // wide enough for everything to fit, the indicator had no width to defend.
    const base = recoveryRules.filter((r) => r.media === null && /flex-basis:\s*100%/.test(r.body))
    expect(base.length, 'expected a base-width full-row rule for .lp-recovery').toBeGreaterThan(0)
  })

  it('is never display:none at any width', () => {
    // ⚑ Editing is unavailable at ≤640px, which once looked like a reason to hide this. But that
    // guard runs ON MOUNT, so a session unlocked wider SURVIVES a resize — and that is exactly when
    // a teacher needs to know whether their work is safe.
    const hidden = recoveryRules.filter((r) => /display:\s*none/.test(r.body))
    expect(
      hidden.map((r) => `${r.selectors.join(',')} @${r.media ?? 'base'}`),
      'the recovery indicator must never be hidden — see the ⚑ in custom.scss',
    ).toEqual([])
  })
})
