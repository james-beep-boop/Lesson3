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
 * user really typed would defeat the point of capturing them.
 *
 * Presentational, like `Indicator`: it renders an offer and reports which button was pressed. Which
 * captures are restorable is decided by `offerKind` in `protocol.ts`, so this file can never become a
 * second place where that question is answered.
 */
import { Button } from '@payloadcms/ui'
import React from 'react'

import { PROSE_LABELS } from '../../hooks/fieldSplit'
import { orphanHeading, parseKey } from '../../lib/editRecovery/projection'
import Modal from '../Modal'
import type { OfferedCapture } from './protocol'

type Group = { heading: string; lines: { field: string; value: string }[] }

/**
 * The label the EDITOR puts above this field.
 *
 * ⚑ Looked up, never derived. The authored labels are not mechanical — `keyInquiry` is "Key inquiry
 * question", `purposeInStoryline` is "Purpose in the storyline" — and a de-camelising regex got both
 * wrong, so the panel named fields differently from the form the teacher was comparing them against
 * while deciding. `PROSE_LABELS` is pinned to the field config by
 * `tests/unit/proseWhitelistDrift.spec.ts`; the de-camelise survives only as a fallback for a field
 * added to the whitelist and not yet to the map.
 */
const fieldLabel = (field: string): string => {
  const authored = PROSE_LABELS[field]
  if (authored) return authored
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Turn the capture map into readable, ATTRIBUTED prose, ordered as the plan is.
 *
 * ⚑ The heading is the whole point. The map is keyed on row UUIDs, so an unattributed list renders
 * "Overview" once per lesson with nothing to tell them apart — measured in the browser on 2026-08-07,
 * and useless for the one decision this panel exists to support.
 *
 * ⚑ Both the heading AND the order come from `anchors`, which walks the LIVE SOURCE. Neither can come
 * from the capture: its keys carry no ordinal, and it arrives from a JSONB column, which reorders
 * object keys. Iterating the anchors rather than the map is what makes "Lesson 2" mean the teacher's
 * Lesson 2. Anything left over — a row the plan no longer has — is appended at the end under a
 * heading that says so.
 *
 * ⚑ Only non-empty strings are LISTED, but a restore still applies everything in the map, cleared
 * fields included. Rendering a heading over an empty value would read as "this was lost".
 */
const groupsOf = (
  capture: OfferedCapture,
  anchors: { key: string; heading: string }[],
): Group[] => {
  const content = capture.content ?? {}
  const groups: Group[] = []
  const byHeading = new Map<string, Group>()
  const seen = new Set<string>()

  const take = (key: string, heading: string) => {
    const values = content[key]
    if (!values) return
    seen.add(key)
    const lines = Object.entries(values)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
      .map(([field, value]) => ({ field: fieldLabel(field), value }))
    if (lines.length === 0) return

    const existing = byHeading.get(heading)
    if (existing) {
      existing.lines.push(...lines)
      return
    }
    const group = { heading, lines }
    byHeading.set(heading, group)
    groups.push(group)
  }

  for (const { key, heading } of anchors) take(key, heading)
  for (const key of Object.keys(content)) {
    if (seen.has(key)) continue
    const { scope } = parseKey(key)
    take(key, orphanHeading(scope))
  }
  return groups
}

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
  /** `offerKind(capture) === 'readOnly'` — stale or schema-mismatched, so it may be read, not applied. */
  readOnly: boolean
  busy: boolean
  onRestore: () => void
  onKeep: () => void
  onDiscard: () => void
}) {
  const groups = groupsOf(capture, anchors)

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
          You can read and copy them here.
        </p>
      )}

      <div className="lp-restore__body">
        {groups.length === 0 ? (
          <p className="modal__body">The captured changes are empty.</p>
        ) : (
          groups.map((group) => (
            <section key={group.heading} className="lp-restore__group">
              <h3 className="lp-restore__heading">{group.heading}</h3>
              <dl className="lp-restore__list">
                {group.lines.map(({ field, value }) => (
                  <React.Fragment key={field}>
                    <dt>{field}</dt>
                    <dd>{value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
          ))
        )}
      </div>

      <div className="modal__actions">
        {/* No Restore control at all when read-only — a disabled button invites the user to hunt for
            the condition that would enable it, and there is none they can reach. */}
        {!readOnly && (
          <Button buttonStyle="primary" size="small" onClick={onRestore} disabled={busy}>
            {busy ? 'Restoring…' : 'Restore these changes'}
          </Button>
        )}
        <Button buttonStyle="secondary" size="small" onClick={onKeep} disabled={busy}>
          {readOnly ? 'Continue editing' : 'Not now'}
        </Button>
        <Button buttonStyle="error" size="small" onClick={onDiscard} disabled={busy}>
          Discard them
        </Button>
      </div>
    </Modal>
  )
}
