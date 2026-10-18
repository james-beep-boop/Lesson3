import { describe, expect, it } from 'vitest'
import { parseCombineContext } from '../../src/lib/combine/draft'

describe('Combine draft metadata', () => {
  it('stores only a parent id and unique resolved keys', () => {
    expect(parseCombineContext({ mergeParent: 12, resolvedKeys: ['one', 'one'] })).toEqual({
      mergeParent: 12,
      resolvedKeys: ['one'],
    })
    expect(parseCombineContext(undefined)).toBeNull()
  })
  it('rejects snapshots, invalid ids and unbounded key lists', () => {
    for (const value of [
      { mergeParent: 0, resolvedKeys: [] },
      { mergeParent: 12, resolvedKeys: [], text: 'private' },
      { mergeParent: 12, resolvedKeys: Array(1001).fill('a') },
      { mergeParent: 12, resolvedKeys: Array(130).fill('a'.repeat(512)) },
    ]) {
      expect(() => parseCombineContext(value)).toThrow('Invalid Combine draft metadata.')
    }
  })
})
