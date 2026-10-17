/**
 * The day-precision date this app shows on Manage rows and in the editor's "kept until" notice —
 * one formatter, so the same date reads identically on both surfaces.
 *
 * Fixed locale, so a server render and a client render cannot disagree (no hydration mismatch).
 */
const dayFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

export const formatDay = (date: Date | string | number): string => dayFmt.format(new Date(date))
