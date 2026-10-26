import { cache } from 'react'
import type { Payload } from 'payload'

export const MAX_SCHOOL_NAME_LENGTH = 80

/** Shared by the password-confirmed Save and the trusted commissioning command. Empty clears it. */
export function parseSchoolName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('School name must be text.')
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
    throw new Error('School name must be one line, without control characters.')
  }
  const name = value.trim()
  if (name.length > MAX_SCHOOL_NAME_LENGTH)
    throw new Error('School name must be at most 80 characters.')
  return name
}

/** Public display projection only: never expose the rest of the administrator-only global. */
export async function readSchoolName(payload: Payload): Promise<string | null> {
  try {
    const doc = await payload.findGlobal({
      slug: 'system-settings',
      depth: 0,
      overrideAccess: true,
      select: { schoolName: true },
    })
    return parseSchoolName(doc.schoolName) || null
  } catch {
    return null
  }
}

/** Request-scoped React memoization; a later render reads the saved name afresh. */
export const schoolNameForRender = cache(readSchoolName)
