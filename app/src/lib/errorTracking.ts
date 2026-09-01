/**
 * Server-side error tracking (SPEC §11 "error tracking / observability — required before real
 * users"; Phase 5 A4). ⚑ NO BACKEND IS CHOSEN AND THE FEATURE IS OFF (2026-09-01): self-hosted
 * GlitchTip was rejected (it would share a failure domain with the app it watches) and hosted Sentry was
 * deferred (an external data flow, and not a deployment prerequisite). `SENTRY_DSN` is unset everywhere
 * including the release bundle, so every function here is a no-op today. Written against the
 * `@sentry/node` SDK rather than a backend, so adopting any Sentry-protocol endpoint later is a
 * one-variable change.
 *
 * Opt-in via env, like SMTP/backups: with `SENTRY_DSN` unset every function here is a no-op and
 * the app runs exactly as before (pino structured logging stays the primary on-box log stream —
 * this ADDS aggregation/alerting for public exposure, it does not replace logs). Reported events
 * carry route/job CONTEXT that is ids and route paths only, and request headers and bodies are never
 * attached (so no cookies or tokens). ⚑ The exception's own message and stack ARE transmitted, and
 * there is no `beforeSend` scrubber — so this is not a guarantee that no personal data leaves. An SMTP
 * failure in `passwordResetEmail` can carry a recipient address in the error text. Any stronger promise
 * has to be built here, in the SDK, before transmission.
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
    // Error tracking only — no performance tracing: keeps payloads small and stays inside a free tier.
    tracesSampleRate: 0,
  })
}

/** Report an exception with safe, non-PII context. No-op when tracking is disabled. */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!errorTrackingEnabled()) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
