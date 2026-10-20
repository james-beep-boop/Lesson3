/**
 * Do the server and this device disagree about the time? (2026-10-19, the Manage clock warning.)
 *
 * Instants, not wall-clock readings: both sides are milliseconds since the Unix epoch, so two devices
 * in different time zones showing different local times for the SAME instant never disagree here.
 * The device side is the midpoint of the request, which cancels the network delay to well within the
 * tolerance; an hour keeps a slightly-off phone from raising a false alarm while still catching the
 * real failure (a server that lost days or years).
 */
export const CLOCK_TOLERANCE_MS = 60 * 60 * 1000

/**
 * The longest round trip a reading may take and still be compared (#417 review). The device side is
 * the request's midpoint, so its error is at most half the round trip. A device that sleeps while the
 * request is in flight resumes with hours elapsed, and the midpoint then invents a discrepancy that
 * neither clock has. Measured on the wall clock — which keeps counting through suspension — rather
 * than with a timer, which does not reliably fire across it. 30 s keeps the error within 15 s.
 */
export const MAX_ROUND_TRIP_MS = 30_000

/** Whether a reading sent at `sentMs` and handled at `receivedMs` is fresh enough to compare. */
export function readingUsable(sentMs: number, receivedMs: number): boolean {
  const roundTrip = receivedMs - sentMs
  return Number.isFinite(roundTrip) && roundTrip >= 0 && roundTrip <= MAX_ROUND_TRIP_MS
}

export function clocksDisagree(
  serverMs: number,
  deviceMs: number,
  toleranceMs = CLOCK_TOLERANCE_MS,
): boolean {
  if (!Number.isFinite(serverMs) || !Number.isFinite(deviceMs)) return false
  return Math.abs(serverMs - deviceMs) > toleranceMs
}
