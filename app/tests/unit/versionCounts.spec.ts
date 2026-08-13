import { describe, expect, it, vi } from 'vitest'

import { versionCountsByPlan } from '../../src/lib/versionCounts'

describe('versionCountsByPlan', () => {
  it('normalizes driver values and returns one count per plan', async () => {
    const execute = vi.fn().mockResolvedValue({
      rows: [
        { planId: 4, versionCount: 3 },
        { planId: '9', versionCount: '12' },
      ],
    })

    await expect(versionCountsByPlan({ db: { drizzle: { execute } } } as never)).resolves.toEqual(
      new Map([
        [4, 3],
        [9, 12],
      ]),
    )
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
