/**
 * `withAdminResetLinkAllowance` — the SCOPE of the forgot-password rate-limit carve-out.
 *
 * ⚑ The carve-out's soundness has two halves, and the integration suite only covers one. That the
 * hook HONOURS the flag is asserted in `tests/int/adminResetLinkCarveOut.int.spec.ts` (together with
 * the public path still being throttled). What is asserted here is that the flag goes away again —
 * the first version set it on `req.context` and never cleared it, so the exemption silently covered
 * the rest of the request and any write added after it would have inherited an unlimited public
 * budget with nothing failing.
 *
 * No database and no Payload boot: this is a property of one function.
 */
import { describe, it, expect } from 'vitest'

import {
  ADMIN_RESET_LINK_CONTEXT,
  withAdminResetLinkAllowance,
} from '../../src/hooks/authRateLimit'

describe('withAdminResetLinkAllowance', () => {
  it('grants the allowance for the callback and removes it afterwards', async () => {
    const req: { context?: Record<string, unknown> } = { context: {} }
    let seenInside: unknown
    await withAdminResetLinkAllowance(req, async () => {
      seenInside = req.context?.[ADMIN_RESET_LINK_CONTEXT]
    })
    expect(seenInside).toBe(true)
    expect(req.context?.[ADMIN_RESET_LINK_CONTEXT]).toBeUndefined()
  })

  it('removes it even when the callback THROWS', async () => {
    // The failure mode that matters: a throwing `forgotPasswordOperation` must not leave the request
    // exempt for whatever the error handler does next.
    const req: { context?: Record<string, unknown> } = { context: {} }
    await expect(
      withAdminResetLinkAllowance(req, async () => {
        throw new Error('minting failed')
      }),
    ).rejects.toThrow('minting failed')
    expect(req.context?.[ADMIN_RESET_LINK_CONTEXT]).toBeUndefined()
  })

  it('leaves an unrelated context untouched', async () => {
    const req: { context?: Record<string, unknown> } = { context: { somethingElse: 1 } }
    await withAdminResetLinkAllowance(req, async () => undefined)
    expect(req.context?.somethingElse).toBe(1)
  })

  it('works when the request has no context object at all, and still runs the callback', async () => {
    // ⚑ The `ran` flag is the point. Without it this test passes whether or not the callback was
    // invoked — "the key is absent afterwards" is trivially true for a function that does nothing.
    const req: { context?: Record<string, unknown> } = {}
    let ran = false
    let seenInside: unknown
    await withAdminResetLinkAllowance(req, async () => {
      ran = true
      seenInside = req.context?.[ADMIN_RESET_LINK_CONTEXT]
    })
    expect(ran).toBe(true)
    expect(seenInside).toBe(true)
    expect(req.context?.[ADMIN_RESET_LINK_CONTEXT]).toBeUndefined()
  })

  it('preserves the identity of an existing context object', async () => {
    // Anything that captured `req.context` earlier in the request must still observe the allowance.
    // Replacing the object rather than mutating it would leave such a holder with a detached copy.
    const req: { context?: Record<string, unknown> } = { context: {} }
    const captured = req.context
    await withAdminResetLinkAllowance(req, async () => {
      expect(captured?.[ADMIN_RESET_LINK_CONTEXT]).toBe(true)
    })
    expect(req.context).toBe(captured)
  })
})
