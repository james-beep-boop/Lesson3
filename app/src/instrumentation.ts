/**
 * Next.js instrumentation module (stable since Next 15; hook shape verified against installed
 * next@16 `server/instrumentation/types.d.ts`). Two duties, both env-gated no-ops unless
 * `SENTRY_DSN` is set (see lib/errorTracking):
 *
 *   - `register()` — runs once per server runtime at boot; initializes the tracker.
 *   - `onRequestError()` — Next invokes it for every unhandled error in renders, route
 *     handlers, server actions and proxies; forwards to the tracker with route context only
 *     (the request HEADERS Next passes are deliberately dropped — they carry auth cookies).
 *
 * Both guard on NEXT_RUNTIME === 'nodejs' with dynamic imports so the edge-runtime bundle
 * (middleware) never pulls in `@sentry/node`.
 */
import type { Instrumentation } from 'next'

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initErrorTracking } = await import('./lib/errorTracking')
    initErrorTracking()
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { captureException } = await import('./lib/errorTracking')
    captureException(error, {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    })
  }
}
