/**
 * `resolveRequestedVersion` (`src/lib/requestedVersion.ts`) — the rule behind the lesson and compare
 * pages' "This version is no longer available" notice (DESIGN-discussions-2026-10-09 §16.1).
 *
 * ⚑ THE LOAD-BEARING DISTINCTION is `absent` versus `unavailable`. Only `absent` may take a page's
 * default (the Official version, the default compare pair); collapsing the two is exactly the silent
 * substitution this replaced.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, expect, it } from 'vitest'

import { resolveRequestedVersion } from '../../src/lib/requestedVersion.js'

const versions = [{ id: 3 }, { id: 7 }, { id: 12 }] as const

describe('resolveRequestedVersion', () => {
  it('no id, or an empty one, is absent — the page default applies', () => {
    expect(resolveRequestedVersion(undefined, versions)).toEqual({ kind: 'absent' })
    expect(resolveRequestedVersion('', versions)).toEqual({ kind: 'absent' })
  })

  it("finds one of the plan's readable versions", () => {
    expect(resolveRequestedVersion('7', versions)).toEqual({ kind: 'found', version: { id: 7 } })
  })

  it('an id that is not in the list is unavailable, never a fallback', () => {
    // Deleted, unreadable and another plan's version all look the same from here: not in the list.
    expect(resolveRequestedVersion('8', versions)).toEqual({ kind: 'unavailable' })
    expect(resolveRequestedVersion('7', [])).toEqual({ kind: 'unavailable' })
  })

  it('malformed ids are unavailable, including ones Number() would accept', () => {
    for (const raw of ['abc', '7abc', ' 7 ', '1e1', '0x07', '-7', '7.0', '+7']) {
      expect(resolveRequestedVersion(raw, versions), raw).toEqual({ kind: 'unavailable' })
    }
  })

  it('a repeated parameter names no single version', () => {
    expect(resolveRequestedVersion(['7', '12'], versions)).toEqual({ kind: 'unavailable' })
    expect(resolveRequestedVersion(['7'], versions)).toEqual({ kind: 'unavailable' })
  })
})
