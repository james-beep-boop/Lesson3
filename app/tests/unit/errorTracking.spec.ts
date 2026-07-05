/**
 * Error-tracking gate + forwarding (Phase 5 A4). Pins the two properties the integration relies
 * on: (1) with no SENTRY_DSN the entire feature is inert — init/capture are safe no-ops, so the
 * app behaves exactly as before the feature existed; (2) with a DSN, captureException forwards
 * the error + context to the SDK. Also pins the instrumentation wiring Next discovers by name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sentryMock = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
}))
vi.mock('@sentry/node', () => sentryMock)

import { errorTrackingEnabled, initErrorTracking, captureException } from '../../src/lib/errorTracking'
import * as instrumentation from '../../src/instrumentation'

const ORIGINAL_DSN = process.env.SENTRY_DSN

beforeEach(() => {
  sentryMock.init.mockClear()
  sentryMock.captureException.mockClear()
})

afterEach(() => {
  if (ORIGINAL_DSN === undefined) delete process.env.SENTRY_DSN
  else process.env.SENTRY_DSN = ORIGINAL_DSN
})

describe('error tracking (lib/errorTracking)', () => {
  it('is fully inert without SENTRY_DSN — no init, no capture, no throw', () => {
    delete process.env.SENTRY_DSN
    expect(errorTrackingEnabled()).toBe(false)
    expect(() => initErrorTracking()).not.toThrow()
    expect(() => captureException(new Error('boom'), { a: 1 })).not.toThrow()
    expect(sentryMock.init).not.toHaveBeenCalled()
    expect(sentryMock.captureException).not.toHaveBeenCalled()
  })

  it('initializes error-only (no tracing) and forwards exceptions with context when DSN set', () => {
    process.env.SENTRY_DSN = 'https://key@glitchtip.example/1'
    initErrorTracking()
    expect(sentryMock.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://key@glitchtip.example/1', tracesSampleRate: 0 }),
    )
    const err = new Error('job failed')
    captureException(err, { job: 'generateVersionArtifact', versionId: 7 })
    expect(sentryMock.captureException).toHaveBeenCalledWith(err, {
      extra: { job: 'generateVersionArtifact', versionId: 7 },
    })
  })

  it('instrumentation exports the hooks Next discovers by name', () => {
    expect(typeof instrumentation.register).toBe('function')
    expect(typeof instrumentation.onRequestError).toBe('function')
  })

  it('onRequestError forwards route context but never the request headers (auth cookies)', async () => {
    process.env.SENTRY_DSN = 'https://key@glitchtip.example/1'
    const prevRuntime = process.env.NEXT_RUNTIME
    process.env.NEXT_RUNTIME = 'nodejs'
    try {
      const err = new Error('render blew up')
      await instrumentation.onRequestError(
        err,
        { path: '/lessons/1', method: 'GET', headers: { cookie: 'payload-token=SECRET' } },
        {
          routerKind: 'App Router',
          routePath: '/lessons/[id]',
          routeType: 'render',
          revalidateReason: undefined,
        },
      )
      expect(sentryMock.captureException).toHaveBeenCalledTimes(1)
      const [, hint] = sentryMock.captureException.mock.calls[0]
      expect(JSON.stringify(hint)).not.toContain('SECRET')
      expect(hint.extra).toMatchObject({ path: '/lessons/1', routePath: '/lessons/[id]' })
    } finally {
      if (prevRuntime === undefined) delete process.env.NEXT_RUNTIME
      else process.env.NEXT_RUNTIME = prevRuntime
    }
  })
})
