/**
 * The school name's rules, with no dependencies, so the browser-side Manage panel can check a name before
 * asking for a password (as `lib/systemFlagNames.ts` is split from its reader). The render-time read is
 * `schoolNameForRender` in `lib/systemFlags.ts`, sharing the flags' single settings read.
 */
export const MAX_SCHOOL_NAME_LENGTH = 80

/** Shared by the password-confirmed Save, the commissioning command and the field hook. Empty clears it. */
export function parseSchoolName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('School name must be text.')
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)) {
    throw new Error('School name must be one line, without control characters.')
  }
  const name = value.trim()
  if (name.length > MAX_SCHOOL_NAME_LENGTH)
    throw new Error(`School name must be at most ${MAX_SCHOOL_NAME_LENGTH} characters.`)
  return name
}
