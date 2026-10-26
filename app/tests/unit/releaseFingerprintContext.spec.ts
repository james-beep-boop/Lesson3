/**
 * The ingest fingerprint must not outlive its one create (#416 review).
 *
 * Payload's `createLocalReq` REPLACES `req.context` with a new object; the fake `create` below does
 * the same, so this pins the bug Codex found: clearing a stale reference left the fingerprint on the
 * live request. The integration test repeats it with real Payload.
 */
import { describe, expect, it } from 'vitest'

import { ARES_RELEASE_CONTEXT, RELEASE_FINGERPRINT_CONTEXT } from '../../src/fields/identity'
import { withReleaseFingerprint } from '../../src/ingest/releaseFingerprintContext'
import { releaseFingerprint } from '../../src/lib/identity/releaseFingerprint'

/** What Payload does to a shared request during a create. */
const replaceContext = (req: { context?: unknown }) => {
  req.context = { ...(req.context as Record<string, unknown>) }
}

describe('withReleaseFingerprint', () => {
  it('offers the fingerprint during the create and leaves none on the live request after', async () => {
    const req: { context?: unknown } = { context: { unrelated: true } }
    let seen: unknown
    await withReleaseFingerprint(req, releaseFingerprint({ title: 'T' }), async () => {
      replaceContext(req)
      seen = (req.context as Record<string, unknown>)[RELEASE_FINGERPRINT_CONTEXT]
    })
    expect(seen).toMatch(/^ares-content-v1:sha256:[0-9a-f]{64}$/)
    expect(req.context).toEqual({ unrelated: true })
  })

  it('offers release identity only for its one create, on success and failure', async () => {
    for (const fail of [false, true]) {
      const req: { context?: unknown } = { context: { unrelated: true } }
      const create = withReleaseFingerprint(
        req,
        releaseFingerprint({ title: 'T' }),
        async () => {
          replaceContext(req)
          expect((req.context as Record<string, unknown>)[ARES_RELEASE_CONTEXT]).toEqual({
            id: 'Nov',
            date: '2026-11-14',
          })
          if (fail) throw new Error('failed')
        },
        { id: 'Nov', date: '2026-11-14' },
      )
      if (fail) await expect(create).rejects.toThrow('failed')
      else await create
      expect(req.context).toEqual({ unrelated: true })
    }
  })

  it('clears it when the create fails, too', async () => {
    const req: { context?: unknown } = {}
    await expect(
      withReleaseFingerprint(req, releaseFingerprint({ title: 'T' }), async () => {
        replaceContext(req)
        throw new Error('database said no')
      }),
    ).rejects.toThrow('database said no')
    expect((req.context as Record<string, unknown>)[RELEASE_FINGERPRINT_CONTEXT]).toBeUndefined()
  })
})
