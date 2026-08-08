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
import { orphanHeading, parseKey } from '../../lib/editRecovery/projection'
import type { OfferedCapture } from './protocol'

type Group = { id: string; heading: string; lines: { field: string; value: string }[] }

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
 * ⚑ Only non-empty strings are LISTED, but a restore still applies everything in the map, cleared
 * fields included. Rendering a heading over an empty value would read as "this was lost".
 *
 * Exported for `tests/unit/restorePromptGroups.spec.ts`: the grouping rules are the substance of this
 * component, and driving them through a render would test JSX rather than the rules.
 */
export const groupsOf = (
  capture: OfferedCapture,
  anchors: { key: string; heading: string }[],
): Group[] => {
  const content = capture.content ?? {}
  const groups: Group[] = []
  const byId = new Map<string, Group>()
  const seen = new Set<string>()

  const take = (key: string, heading: string) => {
    const values = content[key]
    if (!values) return
    seen.add(key)
    const lines = Object.entries(values)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
      .map(([field, value]) => ({ field: fieldLabel(field), value }))
    if (lines.length === 0) return

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
  for (const key of Object.keys(content)) {
    if (seen.has(key)) continue
    const { scope } = parseKey(key)
    take(key, orphanHeading(scope))
  }
  return groups
}
