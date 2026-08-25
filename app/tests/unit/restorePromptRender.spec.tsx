// @vitest-environment jsdom
/**
 * How the restore offer RENDERS the two sides of a change — and the one case where it must not.
 *
 * ⚑ THE DECISION THIS PINS. A restorable capture shows each changed field as a word-level diff, so
 * the teacher sees the edit rather than a paragraph to scan. A READ-ONLY capture does not: that path
 * exists so prose can be read and COPIED OUT (stale or schema-mismatched work that cannot be put back
 * automatically), and unified diff output interleaves the removed words into the new text — a copy
 * would come back corrupted. Two renderings of one list, decided by `readOnly`.
 *
 * Nothing else pinned this. `restoreDiff.spec.ts` proves the diff is right and safe, and
 * `restorePromptGroups.spec.ts` proves the grouping is, but neither can see which of the two the
 * panel chose — and choosing wrong is silent: the read-only panel would still look plausible, and only
 * a teacher pasting their recovered work somewhere would find out.
 */
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * ⚑ `@payloadcms/ui` IS STUBBED, and not as a convenience. `RestorePrompt` imports `Button` from the
 * package ROOT, which pulls `react-image-crop/dist/ReactCrop.css`, and the runner cannot load a `.css`
 * — the suite then fails to COLLECT and reports "0 test" rather than a failure, so a whole file of
 * assertions sits there passing by not running. That is the same trap `restoreGroups.ts` was split out
 * to avoid, hit here from the other direction; observed on the first run of this file.
 *
 * The stub is a real `<button>` so the actions stay queryable by role, and nothing in this file is
 * about Payload's button. The LEAF export the diff itself comes from
 * (`@payloadcms/ui/elements/HTMLDiff/diff`) is deliberately NOT stubbed: it has zero imports, loads
 * fine, and stubbing it would leave the annotations these cases assert on untested.
 */
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}))

import { EditRecoveryRestorePrompt } from '../../src/components/EditRecovery/RestorePrompt'
import type { OfferedCapture } from '../../src/components/EditRecovery/protocol'

afterEach(cleanup)

const SAVED = 'Learners observe the mitochondria under a microscope.'
const TYPED = 'Learners observe the chloroplast under a microscope.'

const capture: OfferedCapture = {
  content: { 'lesson:L1': { overview: TYPED } },
  capturedAt: '2026-08-23T12:00:00.000Z',
  baseUpdatedAt: '2026-08-23T00:00:00.000Z',
  schemaVersion: 'sv-1',
  stale: false,
  schemaMismatch: false,
}

const show = (readOnly: boolean) =>
  render(
    <EditRecoveryRestorePrompt
      capture={readOnly ? { ...capture, stale: true } : capture}
      anchors={[{ key: 'lesson:L1', heading: 'Lesson 1' }]}
      saved={{ 'lesson:L1': { overview: SAVED } }}
      readOnly={readOnly}
      busy={false}
      onRestore={() => {}}
      onKeep={() => {}}
      onDiscard={() => {}}
    />,
  )

/** The one `<dd>` the fixture produces — the panel lists a single changed field. */
const value = () => {
  const dd = document.querySelector('.lp-restore__list dd')
  expect(dd, 'the changed field must be listed at all').not.toBeNull()
  return dd!
}

describe('a restorable capture shows the change, word level', () => {
  it('annotates only the words that moved, leaving the shared frame plain', () => {
    show(false)
    const dd = value()
    expect(dd.querySelector('[data-match-type="delete"]')?.textContent).toBe('mitochondria')
    expect(dd.querySelector('[data-match-type="create"]')?.textContent).toBe('chloroplast')
    // The unchanged frame is present and NOT annotated — the point of diffing rather than dumping.
    expect(dd.textContent).toMatch(/^Learners observe the /)
  })

  it('states which colour is which, because unified output has no pane titles', () => {
    // ⚑ On the compare page the version label above each pane carries this; collapsed into one flow
    // the orientation has nowhere to live, so losing this line makes the colours unreadable.
    show(false)
    const key = document.querySelector('.lp-restore__key')
    expect(key, 'the colour key must be rendered').not.toBeNull()
    // Stated in the annotation styles themselves, so the sentence cannot describe one scheme while
    // the list renders another.
    expect(key!.querySelector('[data-match-type="create"]')).not.toBeNull()
    expect(key!.querySelector('[data-match-type="delete"]')).not.toBeNull()
  })
})

describe('a field the restore would CLEAR', () => {
  /**
   * ⚑ The change a teacher most needs to see before pressing Put the changes back. `applyCapture`
   * writes a captured `''` through, so this is real deletion — and until it was found in review the
   * panel hid it entirely and could report "nothing differs" while the restore wiped a paragraph.
   */
  const cleared = (readOnly: boolean) =>
    render(
      <EditRecoveryRestorePrompt
        capture={{ ...capture, content: { 'lesson:L1': { overview: '' } }, stale: readOnly }}
        anchors={[{ key: 'lesson:L1', heading: 'Lesson 1' }]}
        saved={{ 'lesson:L1': { overview: SAVED } }}
        readOnly={readOnly}
        busy={false}
        onRestore={() => {}}
        onKeep={() => {}}
        onDiscard={() => {}}
      />,
    )

  it('shows the whole saved text struck through, and nothing added', () => {
    cleared(false)
    const dd = value()
    expect(dd.querySelector('[data-match-type="delete"]')?.textContent).toBe(SAVED)
    expect(dd.querySelector('[data-match-type="create"]'), 'nothing is being added').toBeNull()
  })

  it('says "Emptied" on the read-only path, where there is no text to strike', () => {
    // A bare empty <dd> under a field name reads as the panel having lost something.
    cleared(true)
    expect(value().textContent).toBe('Emptied')
  })
})

describe('a READ-ONLY capture shows plain text, so it can be copied', () => {
  it('renders the captured prose verbatim, with no annotations anywhere', () => {
    show(true)
    const dd = value()
    // ⚑ Verbatim and EXACT. A diff here would read as `…the mitochondriachloroplast under…` once the
    // spans are stripped by a copy, which is worse than useless — it is wrong text presented as theirs.
    expect(dd.textContent).toBe(TYPED)
    expect(
      dd.querySelector('[data-match-type]'),
      'no diff annotations on the read-only path',
    ).toBeNull()
  })

  it('and does not offer the colour key it has no colours for', () => {
    show(true)
    expect(document.querySelector('.lp-restore__key')).toBeNull()
  })

  it('still says why the work cannot be put back', () => {
    show(true)
    expect(screen.getByText(/cannot be put back automatically/)).toBeTruthy()
  })
})
