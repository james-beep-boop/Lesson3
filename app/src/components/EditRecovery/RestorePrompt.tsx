'use client'

/**
 * The restore offer — what a teacher sees when unsaved work from a previous session is waiting.
 *
 * ⚑ **Offered, never auto-applied** (SPEC §5). Silently overwriting the form with a recovered
 * capture would be the same class of harm this feature exists to prevent, just pointing the other
 * way: the user must be able to see what was recovered and decide.
 *
 * ⚑ **A stale or schema-mismatched capture is READ-ONLY here — there is no Restore button at all,
 * not a disabled one.** `baseUpdatedAt` mismatch means the source version moved under the capture,
 * so the row ids the overlay is keyed on may no longer mean what they meant; `schemaVersion`
 * mismatch means the field shape changed. Applying either could land prose on the wrong row. The
 * content is still shown in full so it can be read and copied out, because discarding keystrokes the
 * user really typed would defeat the point of capturing them. ⚑ It is also the one path that shows
 * PLAIN captured text rather than a diff — see `restoreDiff` for why a diff would corrupt that copy.
 *
 * ⚑ **Each listed field shows its CHANGE, word level** (operator suggestion 2026-08-23), using the same
 * engine and the same red/green vocabulary as the version-compare page. Listing only the changed fields
 * was the previous step; without the diff a teacher still had to scan a whole paragraph to find the
 * edit inside it. `restoreDiff` holds the reasoning and the safety argument for the injection.
 *
 * Presentational, like `Indicator`: it renders an offer and reports which button was pressed. Which
 * captures are restorable is decided by `offerKind` in `protocol.ts`, so this file can never become a
 * second place where that question is answered.
 */
import { Button } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import Modal from '../Modal'
import type { CaptureMap } from '../../lib/editRecovery/projection'
import type { OfferedCapture } from './protocol'
import { unifiedDiff } from './restoreDiff'
import { groupsOf } from './restoreGroups'

/** Matches how every other user-facing timestamp in the app reads (`VersionTimestamps`, Manage). */
const when = (iso: string): string => {
  const t = Date.parse(iso)
  return Number.isNaN(t)
    ? 'an earlier session'
    : new Date(t).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

export function EditRecoveryRestorePrompt({
  capture,
  anchors,
  saved,
  readOnly,
  busy,
  onRestore,
  onKeep,
  onDiscard,
}: {
  capture: OfferedCapture
  /**
   * `captureAnchors(liveDocument)` — how each capture key is named and ordered.
   *
   * Passed in rather than derived here because it needs the LIVE form document, which only the
   * editor has, and because the key format belongs to `projection.ts`.
   */
  anchors: { key: string; heading: string }[]
  /**
   * `projectCapture(savedDocumentData)` — the SAVED prose, so the panel can list only what differs.
   *
   * ⚑ Without it this listed the whole lesson plan. A capture is a full snapshot (`projectCapture`
   * walks the document and never diffs), so "everything captured" and "everything in the plan" are
   * the same list, and the few fields the teacher actually changed were buried in it.
   */
  saved: CaptureMap
  /** `offerKind(capture) === 'readOnly'` — stale or schema-mismatched, so it may be read, not applied. */
  readOnly: boolean
  busy: boolean
  onRestore: () => void
  onKeep: () => void
  onDiscard: () => void
}) {
  // Both inputs are stable for the life of the offer — the capture came off one response and the
  // anchors were sampled once when the phase opened — so this recomputes only when the offer changes,
  // and the prose list stops being re-reconciled on every unrelated re-render.
  //
  // ⚑ The DIFF is computed in here too, not at render. It is synchronous CPU over the changed region,
  // and this panel re-renders on every `busy` flip — so outside the memo a restore would re-diff every
  // field to draw one button label.
  const groups = useMemo(
    () =>
      groupsOf(capture, anchors, saved).map((group) => ({
        ...group,
        // ⚑ Read-only captures keep PLAIN text. See `restoreDiff`: unified output interleaves the old
        // words into the new, and read-only exists so this prose can be copied out.
        lines: group.lines.map((line) => ({
          ...line,
          html: readOnly ? null : unifiedDiff(line.was, line.now),
        })),
      })),
    [capture, anchors, saved, readOnly],
  )

  return (
    // ⚑ `onClose` routes to KEEP, never discard. Escape and backdrop-click are ambiguous gestures,
    // and the safe reading of an ambiguous gesture is "leave my work alone" — a stray keypress must
    // not be the thing that destroys the capture. It is also vetoed while a restore is in flight, so
    // the panel cannot vanish mid-`reset`.
    <Modal
      title="You have unsaved changes from an earlier session"
      onClose={() => {
        if (!busy) onKeep()
      }}
      className="lp-restore"
    >
      {/* ⚑ `capturedAt`, NOT `baseUpdatedAt`. The latter is the source version's mtime and would tell
          a teacher their afternoon's work was captured whenever the plan was last saved.
          A real `<time>`: the rendered text is a LOCALE string, so `dateTime` is the only form of this
          value a test — or anything else — can read back without guessing at the browser's locale. */}
      <p className="modal__body">
        Captured <time dateTime={capture.capturedAt}>{when(capture.capturedAt)}</time>.
      </p>

      {readOnly && (
        <p className="lp-restore__warn">
          {capture.stale
            ? 'This lesson plan has been saved by someone since these changes were captured, so they cannot be put back automatically.'
            : 'These changes were captured by an older version of the editor, so they cannot be put back automatically.'}{' '}
          You can read and copy them here — the list below is what differs from the version saved
          now, so it may include someone else&apos;s edits.
        </p>
      )}

      {/* ⚑ Unified output has no PANE TITLES. On the compare page the version labels above each pane
          are what tell a reader which side is which; collapsed into one flow that orientation has
          nowhere to live, so it is stated — and stated in the annotation styles themselves, so the
          sentence cannot describe one colour scheme while the list below renders another. */}
      {!readOnly && groups.length > 0 && (
        <p className="lp-restore__key">
          {/* ⚑ Both chips sit MID-sentence on purpose. The annotations carry side padding (they have
              to — unified output butts a removal straight against its replacement), so a chip at the
              END of the sentence pushes the full stop away from it and reads as "struck through ."
              Subject-first keeps plain text on both sides of every chip. */}
          <span data-match-type="create">Green</span> is your unsaved wording;{' '}
          <span data-match-type="delete">struck through</span> is what the saved version says.
        </p>
      )}

      <div className="lp-restore__body">
        {groups.length === 0 ? (
          // Reached when the capture matches what is already stored — usually because the session
          // ended after a save. Nothing to list is the honest answer, and far better than the whole
          // document.
          <p className="modal__body">Nothing in these changes differs from the saved version.</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="lp-restore__group">
              <h3 className="lp-restore__heading">{group.heading}</h3>
              <dl className="lp-restore__list">
                {group.lines.map(({ field, now, html }) => (
                  <React.Fragment key={field}>
                    <dt>{field}</dt>
                    {/* Safe to inject: `unifiedDiff` escapes the prose before the engine sees it, so
                        the only markup here is the engine's own annotation spans. The reasoning, and
                        the probe behind it, are on `restoreDiff`. */}
                    {html === null ? (
                      <dd>{now}</dd>
                    ) : (
                      <dd dangerouslySetInnerHTML={{ __html: html }} />
                    )}
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))
        )}
      </div>

      {/* ⚑ `lp-btn` is what puts these IN the app's button system, and its absence is why "Discard the
          changes" rendered as bare text: the admin's `.btn.lp-btn` block (custom.scss) is where the
          destructive outline, the focus ring and the hover fill live, and Payload's own
          `btn--style-error` sets none of them. Every other dialog in the app already passes it —
          `LinkedTextarea`, `DeletePlansPanel` — so this panel was the outlier, not the pattern.
          Measured before the fix: transparent background, transparent border, black ink. */}
      <div className="modal__actions">
        {/* No Restore control at all when read-only — a disabled button invites the user to hunt for
            the condition that would enable it, and there is none they can reach. */}
        {!readOnly && (
          <Button
            className="lp-btn"
            buttonStyle="primary"
            size="small"
            onClick={onRestore}
            disabled={busy}
          >
            {busy ? 'Putting them back…' : 'Put the changes back'}
          </Button>
        )}
        <Button
          className="lp-btn"
          buttonStyle="secondary"
          size="small"
          onClick={onKeep}
          disabled={busy}
        >
          {readOnly ? 'Continue editing' : 'Decide later'}
        </Button>
        <Button
          className="lp-btn"
          buttonStyle="error"
          size="small"
          onClick={onDiscard}
          disabled={busy}
        >
          Discard the changes
        </Button>
      </div>
    </Modal>
  )
}
