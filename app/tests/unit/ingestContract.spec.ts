import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  contractDrift,
  CURRENT_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
} from '../../src/ingest/contract'

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

/**
 * One schema per contract revision (2026-11-26, ARES R1). The current schema is upstream's file, byte for
 * byte; the hand-rolled validator only understands a fixed keyword set, so a future upstream schema that
 * used another keyword (`minLength`, `oneOf`, …) would be silently unenforced. Both guards fail loudly.
 */
describe('contract revisions', () => {
  const ingest = new URL('../../src/ingest/', import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, ingest))
  const SUPPORTED_KEYWORDS = new Set([
    '$schema',
    '$id',
    '$comment',
    '$defs',
    '$ref',
    'title',
    'description',
    'type',
    'required',
    'properties',
    'additionalProperties',
    'items',
    'minItems',
    'minimum',
    'enum',
    'pattern',
  ])
  const keywordsOf = (node: unknown, out = new Set<string>()): Set<string> => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return out
    for (const [key, value] of Object.entries(node)) {
      out.add(key)
      if (key === 'properties' || key === '$defs')
        for (const child of Object.values(value as object)) keywordsOf(child, out)
      else if (key !== 'enum' && key !== 'required') keywordsOf(value, out)
    }
    return out
  }

  it('accepts exactly R0 (1.0.0) and R1 (1.1.0), and exports the current one', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual(['1.0.0', '1.1.0'])
    expect(CURRENT_SCHEMA_VERSION).toBe('1.1.0')
  })

  it.each(['ares-contract.schema.json', 'ares-contract-1.0.0.schema.json'])(
    '%s uses only keywords the validator enforces',
    (name) => {
      const unknown = [...keywordsOf(JSON.parse(read(name).toString()))].filter(
        (k) => !SUPPORTED_KEYWORDS.has(k),
      )
      expect(unknown).toEqual([])
    },
  )

  it('the current schema is the byte-verbatim upstream copy recorded in PROVENANCE.md', () => {
    const record = readFileSync(
      new URL('../../src/generator/vendor/PROVENANCE.md', import.meta.url),
      'utf8',
    )
    const digest = createHash('sha256').update(read('ares-contract.schema.json')).digest('hex')
    expect(record).toContain(
      `| \`ingest/ares-contract.schema.json\` | \`ares-contract.schema.json\` | \`${digest}\` |`,
    )
  })
})
