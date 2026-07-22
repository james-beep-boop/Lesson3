import { describe, expect, it, vi } from 'vitest'

import { enqueueDetached } from '@/lib/enqueue'
import type { Payload } from 'payload'

/**
 * `enqueueDetached` is a THIN wrapper whose whole value is at the type level: it forwards `{ task,
 * input }` to `payload.jobs.queue` on a fresh connection (L3-03) while making two mistakes
 * unrepresentable. Those two negative cases are the point of this file, asserted with
 * `@ts-expect-error` — if either mistake ever compiles again, tsc fails on the now-unused directive.
 *
 * (An earlier version of the type used `Omit<Extract<Parameters<queue>[0], …>, 'req'>`, which
 * collapsed `input` to the union of EVERY task's input and silently accepted a mismatched pair. The
 * generic form restores the per-task correlation that the native `queue` has.)
 */
describe('enqueueDetached — types (the reason it exists)', () => {
  const fakePayload = () =>
    ({ jobs: { queue: vi.fn().mockResolvedValue({ id: 1 }) } }) as unknown as Payload

  it('forwards exactly { task, input } to jobs.queue, with no req', async () => {
    const payload = fakePayload()
    await enqueueDetached(payload, {
      task: 'messagePing',
      input: { messageId: 1, recipientUserId: 2, senderUserId: 3 },
    })
    const queue = payload.jobs.queue as unknown as ReturnType<typeof vi.fn>
    expect(queue).toHaveBeenCalledTimes(1)
    const arg = queue.mock.calls[0][0]
    expect(arg).toEqual({
      task: 'messagePing',
      input: { messageId: 1, recipientUserId: 2, senderUserId: 3 },
    })
    expect('req' in arg).toBe(false)
  })

  it('rejects a passed req at compile time', () => {
    const payload = fakePayload()
    void (() =>
      enqueueDetached(payload, {
        task: 'messagePing',
        input: { messageId: 1, recipientUserId: 2, senderUserId: 3 },
        // @ts-expect-error — a caller req would rejoin the transaction; the whole point is that it cannot be passed
        req: {},
      }))
  })

  it("rejects an input that doesn't match its task slug at compile time", () => {
    const payload = fakePayload()
    void (() =>
      enqueueDetached(payload, {
        task: 'passwordResetEmail',
        // @ts-expect-error — passwordResetEmail wants { userId }, not messagePing's shape
        input: { messageId: 1, recipientUserId: 2, senderUserId: 3 },
      }))
  })
})
