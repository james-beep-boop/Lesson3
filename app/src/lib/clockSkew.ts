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

export function clocksDisagree(
  serverMs: number,
  deviceMs: number,
  toleranceMs = CLOCK_TOLERANCE_MS,
): boolean {
  if (!Number.isFinite(serverMs) || !Number.isFinite(deviceMs)) return false
  return Math.abs(serverMs - deviceMs) > toleranceMs
}
