/**
 * Env-gated phase timings for server renders — `RENDER_TIMINGS=1`.
 *
 * Why this exists (perf work 2026-08-03, DECISIONS.md): the 5–7s login turned out to be the
 * catalogue rendered twice, and that was only diagnosable because Next logs per-request totals. The
 * *remaining* ~4.4s of a single catalogue render is not diagnosable that way — a route total cannot
 * tell you whether the cost is Payload queries, the JS mapping, or React serialising the payload.
 * Guessing is how a snapshot field gets denormalised for nothing, so: measure the phases first.
 *
 * **Reading the output.** Compare `totalMs` against Next's `application-code` figure for the same
 * request; the difference is React render + RSC serialisation. ⚑ It is also every query nobody
 * wrapped — an unwrapped `await` inflates that gap and reads as "serialisation", which is the one
 * wrong answer this helper exists to prevent. Confirm the phases cover each `await` before drawing
 * that conclusion.
 *
 * Emits through `payload.logger` (pino, `LOG_LEVEL` — OPS.md → Structured logging) rather than
 * `console.log`, so the line is queryable JSON like every other app log and the per-phase numbers
 * aggregate across samples instead of needing to be re-read by eye.
 *
 * Disabled is the default and costs nothing: a shared no-op is returned, so call sites stay
 * unconditional, no clock is read and nothing is allocated.
 */
import type { Payload } from 'payload'

export interface RenderTimings {
  /** Run `work`, recording how long it took under `label`. Records on throw too. */
  time<T>(label: string, work: () => Promise<T>): Promise<T>
  /** Emit one structured record for the whole render. Call once, at the end. */
  report(logger: Payload['logger']): void
}

const NOOP: RenderTimings = {
  time: (_label, work) => work(),
  report: () => {},
}

export function startRenderTimings(route: string): RenderTimings {
  if (process.env.RENDER_TIMINGS !== '1') return NOOP

  // Concurrent phases legitimately overlap, so these are durations, NOT a partition of the total.
  const phases: Record<string, number> = {}
  const started = performance.now()

  return {
    async time(label, work) {
      const t0 = performance.now()
      try {
        return await work()
      } finally {
        phases[label] = Math.round(performance.now() - t0)
      }
    },
    report(logger) {
      const totalMs = Math.round(performance.now() - started)
      logger.info({ route, totalMs, phases }, 'render timings')
    },
  }
}
