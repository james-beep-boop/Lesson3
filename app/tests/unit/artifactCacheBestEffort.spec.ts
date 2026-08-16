/**
 * `bestEffortArtifact` (`generator/artifactCache.ts`) — the cache's failure reporting.
 *
 * WHY THIS EXISTS. Both HTML caches used to wrap every cache call in `.catch(() => null)`, and the
 * failure that hides behind it is the expensive one: a permissions fault, a full disk or an
 * exhausted file-descriptor table makes every read miss AND every write fail, so the process
 * silently repeats full DOCX generation, mammoth conversion, sanitization and HTML diffing on every
 * request. Responses stay correct, so nothing alerts — the system merely runs at a fraction of its
 * speed, which is the hardest class of fault to notice.
 *
 * ⚑ TWO PROPERTIES ARE IN TENSION AND BOTH ARE ASSERTED HERE. It must never fail the caller (the
 * bytes were produced; a cache is an optimisation), and it must not be silent. The resolution is
 * "log the first failure of each kind" — which means the once-only behaviour is load-bearing, not a
 * nicety: a broken cache fails on EVERY request, so an unbounded log would bury the signal it
 * exists to raise.
 *
 * DB-free and Payload-boot-free → runs in `test:unit`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  bestEffortArtifact,
  resetArtifactCacheWarnings,
} from '../../src/generator/artifactCache.js'

const loggerStub = () => ({ warn: vi.fn() })

beforeEach(() => {
  // The warned-set is module state that deliberately survives calls; each case needs a clean slate.
  resetArtifactCacheWarnings()
})

describe('bestEffortArtifact — never fails the caller', () => {
  it('passes a successful result straight through', async () => {
    const logger = loggerStub()
    await expect(bestEffortArtifact(logger, 'read', async () => 'bytes', null)).resolves.toBe(
      'bytes',
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('returns the fallback instead of throwing when the work fails', async () => {
    const logger = loggerStub()
    const result = await bestEffortArtifact(
      logger,
      'read',
      async () => {
        throw new Error('EACCES: permission denied')
      },
      null,
    )
    expect(result).toBeNull()
  })

  /**
   * ⚑ A MISS IS NOT A FAILURE. `getArtifact` returns null for `ENOENT` — the ordinary cold-cache
   * case — and throws only for real faults. If that distinction were ever collapsed back into a
   * catch, every cold start would log a spurious warning and the signal would be worthless.
   */
  it('does not warn when the work legitimately resolves null', async () => {
    const logger = loggerStub()
    await expect(bestEffortArtifact(logger, 'read', async () => null, null)).resolves.toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

describe('bestEffortArtifact — reports the first failure of each kind, once', () => {
  it('warns on the first failure', async () => {
    const logger = loggerStub()
    await bestEffortArtifact(
      logger,
      'read',
      async () => {
        throw new Error('boom')
      },
      null,
    )
    expect(logger.warn).toHaveBeenCalledTimes(1)

    // The payload must carry enough to act on: the error, which operation, and where the cache is.
    const [context] = logger.warn.mock.calls[0] as [Record<string, unknown>, string]
    expect(context).toMatchObject({ operation: 'read' })
    expect(context.err).toBeInstanceOf(Error)
    expect(context.cacheDir).toBeTruthy()
  })

  it('stays silent on subsequent failures of the SAME operation', async () => {
    const logger = loggerStub()
    const fail = async (): Promise<null> => {
      throw new Error('still broken')
    }

    for (let i = 0; i < 25; i++) await bestEffortArtifact(logger, 'read', fail, null)

    expect(
      logger.warn,
      'a broken cache fails on every request — an unbounded log buries its own signal',
    ).toHaveBeenCalledTimes(1)
  })

  it('warns separately for read and write — they are different faults', async () => {
    const logger = loggerStub()
    const fail = async (): Promise<null> => {
      throw new Error('broken')
    }

    await bestEffortArtifact(logger, 'read', fail, null)
    await bestEffortArtifact(logger, 'write', fail, null)
    await bestEffortArtifact(logger, 'read', fail, null)
    await bestEffortArtifact(logger, 'write', fail, null)

    expect(logger.warn).toHaveBeenCalledTimes(2)
    const operations = logger.warn.mock.calls.map(
      (call) => (call[0] as { operation: string }).operation,
    )
    expect(operations.sort()).toEqual(['read', 'write'])
  })

  /**
   * The guard set is bounded to the two operation kinds by construction. Asserted because the
   * obvious "improvement" — keying the set by error message so distinct faults each get a line —
   * turns a two-entry set into one that grows without bound on a cache emitting varied errors.
   */
  it('never accumulates more than the two operation kinds', async () => {
    const logger = loggerStub()
    for (let i = 0; i < 50; i++) {
      await bestEffortArtifact(
        logger,
        i % 2 === 0 ? 'read' : 'write',
        async () => {
          throw new Error(`distinct failure ${i}`)
        },
        null,
      )
    }
    expect(logger.warn).toHaveBeenCalledTimes(2)
  })
})
