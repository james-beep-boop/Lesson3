/**
 * The System Save endpoint's body contract (`src/endpoints/systemSettingsSave.ts`) — an explicit
 * allowlist, never a passthrough (`docs/DESIGN-system-panel-2026-08-21.md`, "THE SAVE ENDPOINT MUST BE
 * THE SOLE WRITER").
 *
 * ⚑ THE LOAD-BEARING CASE is `publicLibraryLive` being REFUSED. It is a real stored flag, so a parser
 * that checked "is this one of `SYSTEM_FLAGS`" instead of `SAVEABLE_FLAGS` would accept it — and make a
 * switch writable that nothing enforces.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`. The wire behaviour (401/403/409/lockout, the
 * concurrent pair) is `tests/http/systemSettings.http.spec.ts`.
 */
import { describe, expect, it } from 'vitest'

import { SYSTEM_FLAGS } from '../../src/globals/SystemSettings.js'
import { parseSaveBody, SAVEABLE_FLAGS } from '../../src/endpoints/systemSettingsSave.js'

const TOKEN = '2026-10-09T08:00:00.000Z'
const valid = { changes: { forumEnabled: false }, password: 'pw', expectedUpdatedAt: TOKEN }

/** The 400 message, or null when the body parsed. */
const refusal = (body: unknown): string | null => {
  try {
    parseSaveBody(body)
    return null
  } catch (e) {
    expect((e as { status?: number }).status).toBe(400)
    return (e as Error).message
  }
}

describe('parseSaveBody', () => {
  it('accepts exactly the allowed shape', () => {
    expect(parseSaveBody(valid)).toEqual(valid)
    expect(parseSaveBody({ ...valid, changes: { forumEnabled: true } }).changes).toEqual({
      forumEnabled: true,
    })
  })

  it('refuses a stored-but-unsaveable flag (publicLibraryLive)', () => {
    expect(refusal({ ...valid, changes: { publicLibraryLive: true } })).toMatch(/publicLibraryLive/)
    expect(refusal({ ...valid, changes: { forumEnabled: true, publicLibraryLive: true } })).toMatch(
      /publicLibraryLive/,
    )
  })

  it('refuses unknown flags and non-boolean values', () => {
    expect(refusal({ ...valid, changes: { flagChanges: [] } })).toMatch(/flagChanges/)
    for (const value of ['false', 0, 1, null, undefined, {}]) {
      expect(refusal({ ...valid, changes: { forumEnabled: value } }), String(value)).toMatch(
        /true or false/,
      )
    }
  })

  it('refuses an empty or missing change set', () => {
    expect(refusal({ ...valid, changes: {} })).toBe('Nothing to save.')
    expect(refusal({ ...valid, changes: undefined })).not.toBeNull()
    expect(refusal({ ...valid, changes: [] })).not.toBeNull()
  })

  it('requires a password and a freshness token', () => {
    expect(refusal({ ...valid, password: '' })).toMatch(/password/)
    expect(refusal({ ...valid, password: undefined })).toMatch(/password/)
    expect(refusal({ ...valid, password: 'x'.repeat(1025) })).toMatch(/password/)
    expect(refusal({ ...valid, expectedUpdatedAt: undefined })).toMatch(/expectedUpdatedAt/)
    expect(refusal({ ...valid, expectedUpdatedAt: 'yesterday' })).toMatch(/expectedUpdatedAt/)
  })

  it('refuses anything that is not a JSON object', () => {
    for (const body of [null, undefined, 'x', 3, [valid]]) {
      expect(refusal(body), JSON.stringify(body)).not.toBeNull()
    }
  })
})

describe('SAVEABLE_FLAGS', () => {
  it('is a subset of SYSTEM_FLAGS that excludes the unenforced public-library flag', () => {
    for (const flag of SAVEABLE_FLAGS) expect(SYSTEM_FLAGS).toContain(flag)
    expect(SAVEABLE_FLAGS).not.toContain('publicLibraryLive')
  })
})
