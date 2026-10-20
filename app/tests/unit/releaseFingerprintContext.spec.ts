/**
 * The ingest fingerprint must not outlive its one create (#416 review).
 *
 * Payload's `createLocalReq` REPLACES `req.context` with a new object; the fake `create` below does
 * the same, so this pins the bug Codex found: clearing a stale reference left the fingerprint on the
 * live request. The integration test repeats it with real Payload.
 */
import { describe, expect, it } from 'vitest'

import { RELEASE_FINGERPRINT_CONTEXT } from '../../src/fields/identity'
import { withReleaseFingerprint } from '../../src/ingest/releaseFingerprintContext'

/** What Payload does to a shared request during a create. */
const replaceContext = (req: { context?: unknown }) => {
  req.context = { ...(req.context as Record<string, unknown>) }
}

describe('withReleaseFingerprint', () => {
  it('offers the fingerprint during the create and leaves none on the live request after', async () => {
    const req: { context?: unknown } = { context: { unrelated: true } }
    let seen: unknown
    await withReleaseFingerprint(req, { title: 'T' }, async () => {
      replaceContext(req)
      seen = (req.context as Record<string, unknown>)[RELEASE_FINGERPRINT_CONTEXT]
    })
    expect(seen).toMatch(/^ares-content-v1:sha256:[0-9a-f]{64}$/)
    expect(req.context).toEqual({ unrelated: true })
  })

  it('clears it when the create fails, too', async () => {
    const req: { context?: unknown } = {}
    await expect(
      withReleaseFingerprint(req, { title: 'T' }, async () => {
        replaceContext(req)
        throw new Error('database said no')
      }),
    ).rejects.toThrow('database said no')
    expect((req.context as Record<string, unknown>)[RELEASE_FINGERPRINT_CONTEXT]).toBeUndefined()
  })
})
