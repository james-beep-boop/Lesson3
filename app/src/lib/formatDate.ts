/**
 * The day-precision date this app shows on Manage rows, in the editor's "kept until" notice and in
 * ARES release labels — one format, so the same date reads identically on every surface.
 *
 * Fixed locale, so a server render and a client render cannot disagree (no hydration mismatch).
 */
const dayOptions = { day: '2-digit', month: 'short', year: 'numeric' } as const
const dayFmt = new Intl.DateTimeFormat('en-GB', dayOptions)
const calendarDayFmt = new Intl.DateTimeFormat('en-GB', { ...dayOptions, timeZone: 'UTC' })

export const formatDay = (date: Date | string | number): string => dayFmt.format(new Date(date))

/**
 * A calendar date (`YYYY-MM-DD`, e.g. an ARES release date) shown as that same day in every time
 * zone — never shifted to the reader's local midnight. Null when it is not a real date.
 */
export function formatCalendarDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  return calendarDayFmt.format(date)
}
