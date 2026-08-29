// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  beginEntryPhase,
  endEntryPhase,
  endEntryPhaseOnFirstInput,
  isEntryPhaseOpen,
} from '@/components/LessonControls/entryPhase'

// Module state models one editor session and is shared across cases, so each case restores the
// default rather than inheriting whatever the previous one left.
beforeEach(() => beginEntryPhase('42'))

describe("the editor visit's entry phase", () => {
  // ⚑ OPEN BY DEFAULT, and this is the case that matters most: nothing has to run first. The earlier
  // design enabled the phase from an effect, and a panel already mounted at load ran its own effect
  // BEFORE that one — child effects flush before a parent's — so the rule silently skipped it.
  it('is open for a document nothing has touched', () => {
    expect(isEntryPhaseOpen('99')).toBe(true)
  })

  it('closes for the document a reveal happened in', () => {
    endEntryPhase('42')

    expect(isEntryPhaseOpen('42')).toBe(false)
  })

  // A jump in one version cannot disarm the rule for the next version opened.
  it('leaves other documents open', () => {
    endEntryPhase('42')

    expect(isEntryPhaseOpen('43')).toBe(true)
  })

  // Navigating away and back re-mounts the editor controls: a new visit, so the rule applies again.
  it('re-opens when the same document is revisited', () => {
    endEntryPhase('42')
    beginEntryPhase('42')

    expect(isEntryPhaseOpen('42')).toBe(true)
  })

  it('does not disturb another document when a visit begins', () => {
    endEntryPhase('43')
    beginEntryPhase('42')

    expect(isEntryPhaseOpen('43')).toBe(false)
  })

  /**
   * ⚑ THE BUG THE FIRST VERSION SHIPPED, reported from the deployed build. Only the jump ended the
   * phase, so opening a panel by its OWN header — the commonest reveal there is — ended nothing: the
   * panel opened, its contents mounted for the first time, and the entry rule shut them again.
   *
   * `pointerdown` in the CAPTURE phase is what makes the fix work, because it must beat the `click`
   * that opens the panel; asserting the listener's effect here is what stops that being re-tuned to
   * `click` by someone who reads the two as interchangeable.
   */
  it('ends on the first pointer input, before the click that opens a panel', () => {
    const detach = endEntryPhaseOnFirstInput('42')

    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(isEntryPhaseOpen('42')).toBe(false)
    detach()
  })

  it('ends on the first key input, for the keyboard reader', () => {
    const detach = endEntryPhaseOnFirstInput('42')

    document.dispatchEvent(new Event('keydown', { bubbles: true }))

    expect(isEntryPhaseOpen('42')).toBe(false)
    detach()
  })

  // ⚑ Scrolling is NOT a reveal. A panel a preference left expanded below the fold must still be
  // collapsed as the reader passes it — that is the below-the-fold coverage the whole design keeps.
  it('does not end on scrolling', () => {
    const detach = endEntryPhaseOnFirstInput('42')

    document.dispatchEvent(new Event('scroll', { bubbles: true }))

    expect(isEntryPhaseOpen('42')).toBe(true)
    detach()
  })

  it('stops listening once it has fired, and after teardown', () => {
    const detach = endEntryPhaseOnFirstInput('42')
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    beginEntryPhase('42')

    // A later input must not re-close a phase that a new visit re-opened.
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(isEntryPhaseOpen('42')).toBe(true)

    detach()
  })
})
