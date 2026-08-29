import { beforeEach, describe, expect, it } from 'vitest'

import {
  beginEntryPhase,
  endEntryPhase,
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
})
