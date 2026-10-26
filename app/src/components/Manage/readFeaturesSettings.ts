import type { Payload, PayloadRequest } from 'payload'

import type { User } from '../../payload-types'

/**
 * The stored school name, feature flags and freshness token for Manage → System → Features, read as the caller (the
 * global's own read access is Site-Administrator only). Null when the read fails.
 *
 * ⚑ NEVER THROWS (review of #380, 2026-10-11). It is one member of the Manage page's parallel reads, and
 * an uncaught failure rejected the WHOLE page for the Site Administrator. A failure is logged and
 * becomes null, which Features renders as "unavailable", with no Save — the same posture as
 * `collectSystemFacts`. A wider database outage can still break other sections; this keeps one bad read
 * from taking the rest of Manage with it.
 */
export async function readFeaturesSettings(
  payload: Payload,
  { user, req }: { user: User | null; req?: PayloadRequest },
) {
  try {
    return await payload.findGlobal({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: false,
      user,
      req,
      select: { features: true, schoolName: true, updatedAt: true },
    })
  } catch (err) {
    payload.logger.error(
      { err, event: 'system_settings_panel_read_failed' },
      'Manage → System → Features could not read the settings; showing it as unavailable',
    )
    return null
  }
}
