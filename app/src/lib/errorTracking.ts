/**
 * Server-side error tracking (SPEC §11 "error tracking / observability — required before real
 * users"; Phase 5 A4). GlitchTip is the chosen backend (self-hosted, user decision 2026-07-05);
 * it speaks the Sentry envelope protocol, so the standard `@sentry/node` SDK is the client and
 * a hosted Sentry DSN would work identically.
 *
 * Opt-in via env, like SMTP/backups: with `SENTRY_DSN` unset every function here is a no-op and
 * the app runs exactly as before (pino structured logging stays the primary on-box log stream —
 * this ADDS aggregation/alerting for public exposure, it does not replace logs). Reported events
 * carry route/job context only — never request headers or bodies (no cookies/tokens in the
 * tracker).
 *
 * Wiring: initialized once from src/instrumentation.ts (Node runtime only); request-scoped
 * errors arrive via Next's `onRequestError` hook; job failures via captureException calls at the
 * existing catch/log seams in src/jobs/*.
 */
import * as Sentry from '@sentry/node'

export const errorTrackingEnabled = (): boolean => Boolean(process.env.SENTRY_DSN)

export function initErrorTracking(): void {
  if (!errorTrackingEnabled()) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    // Error tracking only — no performance tracing (keeps the payloads small and GlitchTip lean).
    tracesSampleRate: 0,
  })
}

/** Report an exception with safe, non-PII context. No-op when tracking is disabled. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!errorTrackingEnabled()) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
