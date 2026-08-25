/**
 * Turning a capture map into something a teacher can read and recognise.
 *
 * ⚑ **A separate module from `RestorePrompt`, and not only for tidiness.** These are the rules the
 * panel is FOR — which prose belongs to which lesson, in what order, under what name — and they are
 * pure. Keeping them in the component meant a unit spec had to import the component to reach them,
 * which pulls `@payloadcms/ui` and, through it, a stylesheet the node-environment test runner cannot
 * load; the spec failed to COLLECT, and a failed suite reports zero tests rather than a failure, so a
 * whole file of assertions sat there passing by not running.
 *
 * Same split, and the same reason, as `protocol.ts` holding the capture decisions.
 */
import { PROSE_LABELS } from '../../hooks/fieldSplit'
import {
  captureDiff,
  orphanHeading,
  parseKey,
  type CaptureMap,
} from '../../lib/editRecovery/projection'
import type { OfferedCapture } from './protocol'

/**
 * One changed field, BOTH SIDES.
 *
 * ⚑ `was` is carried rather than the diff itself, and that is what keeps this module free of
 * `@payloadcms/ui` — see the header. It is also what lets the panel render the same line two ways: a
 * word-level diff when the capture can be put back, plain captured text when it is read-only and the
 * point is to copy it out. `was` is `''` for a field the saved version does not have.
 */
type Line = { field: string; was: string; now: string }

type Group = { id: string; heading: string; lines: Line[] }

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
 * ⚑ Groups are identified by ROW ID, not by heading. `lesson:`, `slo:` and `prompt:` share a heading
 * *because they share a row id*, and merging on the heading alone looked equivalent — until two
 * DELETED lessons appear in one capture, where `orphanHeading` returns the same string for both. They
 * then merged into one section, interleaving two lessons' prose under one title and colliding on the
 * `key={field}` of every field they had in common.
 *
 * ⚑ WHAT COUNTS AS A CHANGE IS NOT DECIDED HERE. `captureDiff` in `projection.ts` owns it, beside the
 * `overlay` it has to agree with — because when this module answered that question itself the two
 * drifted, and the disagreement was about the most destructive thing a restore can do: a captured
 * `''` reads as "nothing to show" to a truthiness test and "clear the field" to the overlay, so the
 * panel could report "Nothing in these changes differs from the saved version" and then delete a
 * paragraph. Rewriting the rule here a second time is what NOT to do; call it instead.
 *
 * What is left is what this module is actually for: which prose belongs to which lesson, in what
 * order, under what name.
 *
 * Exported for `tests/unit/restorePromptGroups.spec.ts`: the grouping rules are the substance of this
 * component, and driving them through a render would test JSX rather than the rules.
 */
export const groupsOf = (
  capture: OfferedCapture,
  anchors: { key: string; heading: string }[],
  /** `projectCapture(savedDocumentData)` — the SAVED prose, which every caller has. */
  saved: CaptureMap,
): Group[] => {
  const changes = captureDiff(saved, capture.content ?? {})
  const groups: Group[] = []
  const byId = new Map<string, Group>()
  const seen = new Set<string>()

  const take = (key: string, heading: string) => {
    const values = changes[key]
    if (!values) return
    seen.add(key)
    const lines = Object.entries(values).map(([field, { was, now }]) => ({
      field: fieldLabel(field),
      was,
      now,
    }))

    // The row a key belongs to — the singleton scopes have none, so they stand alone under their own
    // name. This is what keeps two different deleted lessons in two different sections.
    const { scope, rowId } = parseKey(key)
    const id = rowId ?? scope
    const existing = byId.get(id)
    if (existing) {
      existing.lines.push(...lines)
      return
    }
    const group = { id, heading, lines }
    byId.set(id, group)
    groups.push(group)
  }

  for (const { key, heading } of anchors) take(key, heading)
  for (const key of Object.keys(changes)) {
    if (seen.has(key)) continue
    const { scope } = parseKey(key)
    take(key, orphanHeading(scope))
  }
  return groups
}
