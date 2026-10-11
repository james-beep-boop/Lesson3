/**
 * Manage → System → Features' settings read (`components/Manage/readFeaturesSettings.ts`).
 *
 * ⚑ THE LOAD-BEARING CASE (review of #380, 2026-10-11): a failed read must not reject the Manage page's
 * parallel reads. It logs and answers null, which Features renders as "unavailable" with no Save.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { readFeaturesSettings } from '../../src/components/Manage/readFeaturesSettings'
import type { User } from '../../src/payload-types'

const user = { id: 1, roles: ['siteAdmin'] } as unknown as User

describe('readFeaturesSettings', () => {
  it('reads the flags and freshness token as the caller', async () => {
    const doc = { features: { forumEnabled: true }, updatedAt: '2026-10-11T00:00:00.000Z' }
    const findGlobal = vi.fn(async () => doc)
    const payload = { findGlobal, logger: { error: vi.fn() } } as unknown as Payload
    expect(await readFeaturesSettings(payload, { user })).toBe(doc)
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'system-settings', overrideAccess: false, user }),
    )
  })

  it('logs a failed read and answers null instead of throwing', async () => {
    const error = vi.fn()
    const payload = {
      findGlobal: vi.fn(async () => {
        throw new Error('connection terminated unexpectedly')
      }),
      logger: { error },
    } as unknown as Payload
    expect(await readFeaturesSettings(payload, { user })).toBeNull()
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'system_settings_panel_read_failed' }),
      expect.any(String),
    )
  })
})
