import { describe, expect, it } from 'vitest'

import { contractDrift } from '../../src/ingest/contract'

/**
 * Audit F-C40-001: the gate tested declared keys with `in`, which also finds `Object.prototype`
 * members, so these names passed as declared and nothing beneath them was checked. Each must be
 * reported as an unexpected key at the root, inside META and inside a lesson object, like any other.
 */
const BUILT_IN_NAMES = ['constructor', 'toString', 'hasOwnProperty', 'valueOf']

describe('contractDrift — keys named after built-in object properties', () => {
  it.each(BUILT_IN_NAMES)('rejects %s at the root, inside META and inside a lesson', (name) => {
    const drift = contractDrift({
      [name]: { smuggled: [1, 2, 3] },
      META: { [name]: 'x' },
      LESSONS: [{ [name]: 'x' }],
    })
    expect(drift).toContain(`${name}: unexpected key`)
    expect(drift).toContain(`META.${name}: unexpected key`)
    expect(drift).toContain(`LESSONS[0].${name}: unexpected key`)
  })

  it('still reports a missing required key when only a built-in name is present', () => {
    const drift = contractDrift({ META: {}, constructor: 'x' })
    expect(drift.some((d) => d.endsWith('required field missing'))).toBe(true)
  })
})
