/**
 * `SYSTEM_FLAGS` ↔ the global's `features` fields must not drift.
 *
 * ⚑ THE LIST IS DELIBERATELY HAND-MAINTAINED, for the reason `PANEL_IDS` is: these names are a STORED
 * contract — the `flag` text column in `system_settings_flag_changes` and the `features_*` columns —
 * so deriving them from the field config would trade a readable closed vocabulary for an
 * `as const satisfies` dance and still not make them safe to rename.
 *
 * ⚑ BUT THE DRIFT IS SILENT AND OPEN, which is the shape this project keeps paying for. Add a checkbox
 * to the `features` group and forget the list, and the new flag saves happily with **no provenance
 * row** — nobody recorded who turned it on, and no test fails. That is the same class as the guards
 * `DECISIONS 2026-08-20` is about, and the same fix as `envTemplateParity.spec.ts`: pin two
 * hand-maintained lists to each other rather than trusting review.
 */
import { describe, expect, it } from 'vitest'

import { SYSTEM_FLAGS, SystemSettings } from '@/globals/SystemSettings'

/** The `features` group's checkbox field names, read from the config itself. */
function featureFieldNames(): string[] {
  const group = SystemSettings.fields.find((f) => 'name' in f && f.name === 'features')
  if (!group || !('fields' in group)) throw new Error('no `features` group on SystemSettings')
  return group.fields
    .filter((f) => 'type' in f && f.type === 'checkbox' && 'name' in f)
    .map((f) => (f as { name: string }).name)
}

describe('SYSTEM_FLAGS parity with the global config', () => {
  it('lists exactly the flags the features group defines', () => {
    // Sorted: the list's ORDER is a display concern, its MEMBERSHIP is the contract.
    expect([...SYSTEM_FLAGS].sort()).toEqual(featureFieldNames().sort())
  })

  it('is not empty, so the comparison above can actually fail', () => {
    // Without this, deleting every flag from both sides would "pass".
    expect(SYSTEM_FLAGS.length).toBeGreaterThan(0)
  })

  /**
   * The provenance hook diffs `data.features` against `originalDoc.features` for each name in
   * `SYSTEM_FLAGS`, so a flag stored under a name the list does not carry is written with no record of
   * who changed it. This asserts the shape that makes that impossible.
   */
  it('carries only flat, non-nested checkbox names', () => {
    for (const flag of SYSTEM_FLAGS) {
      expect(flag, 'a dotted name would not resolve against data.features').not.toContain('.')
    }
  })
})
