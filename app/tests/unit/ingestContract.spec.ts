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

  // ⚑ The required-key half of the same fix. No required key is a built-in name, so a case built
  // from built-in names passes under `in` as well (review 2026-10-25). What `in` actually got wrong
  // is an INHERITED key: it counts one as present. An object whose prototype carries META must still
  // report META missing — under `in` it did not.
  it('reports a required key as missing when it is only inherited, not own', () => {
    const inherited = Object.create({ META: {} }) as Record<string, unknown>
    expect(contractDrift(inherited)).toContain('META: required field missing')
  })
})
