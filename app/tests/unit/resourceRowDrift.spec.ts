/**
 * Stored resource-row shape ↔ field-schema drift guard (same stance as `proseWhitelistDrift.spec.ts`).
 *
 * The stored `resourceLinks` row shape is stated twice: as the validator's allowlists in
 * `ingest/resourceLinks.ts` (`STORED_ROW_KEYS` / `RESOURCE_RECORD_KEYS` / `RESOURCE_PHASE_KEYS`) and
 * as the Payload field definition in `fields/lessonContent.ts`. Nothing mechanical tied them: add a
 * field to the schema without updating the allowlist and every ingest fails at RUNTIME ("unexpected
 * phase resource field"); change the schema alone and Payload silently drops the value on write while
 * the validator (which sees pre-write data, not the round-tripped columns) still passes — and the
 * golden-file DOCX diff deliberately excludes resources, so nothing else catches it. This test makes
 * the sync fail fast and named. DB-free → `test:unit`.
 */
import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'

import { lessonContentFields } from '../../src/fields/lessonContent'
import {
  RESOURCE_PHASE_KEYS,
  RESOURCE_RECORD_KEYS,
  STORED_ROW_KEYS,
} from '../../src/ingest/resourceLinks'

/** Named-field children of a group/array field. */
const childrenOf = (f: Field): Field[] => ((f as { fields?: Field[] }).fields ?? [])

/** Find a named field within a list. */
const byName = (fields: Field[], name: string): Field =>
  fields.find((f) => (f as { name?: string }).name === name) as Field

const namesOf = (fields: Field[]): string[] =>
  fields.map((f) => (f as { name: string }).name).sort()

describe('stored resourceLinks rows ↔ lessonContent field schema stay in sync', () => {
  const lessons = byName(lessonContentFields, 'lessons')
  const resourceLinks = byName(childrenOf(lessons), 'resourceLinks') as Field & {
    type: string
    minRows?: number
    maxRows?: number
  }
  const rowFields = childrenOf(resourceLinks)

  it('is an array of exactly one row per phase', () => {
    expect(resourceLinks.type).toBe('array')
    expect(resourceLinks.minRows).toBe(RESOURCE_PHASE_KEYS.length)
    expect(resourceLinks.maxRows).toBe(RESOURCE_PHASE_KEYS.length)
  })

  it('STORED_ROW_KEYS matches the row fields (plus Payload row id)', () => {
    expect([...namesOf(rowFields), 'id'].sort()).toEqual([...STORED_ROW_KEYS].sort())
  })

  it('the phase select offers exactly the phase keys', () => {
    const phase = byName(rowFields, 'phase') as Field & { options: unknown[] }
    const values = phase.options.map((o) => (typeof o === 'string' ? o : (o as { value: string }).value))
    expect(values).toEqual([...RESOURCE_PHASE_KEYS])
  })

  it.each(['video', 'reading'] as const)('RESOURCE_RECORD_KEYS matches the %s group', (name) => {
    expect(namesOf(childrenOf(byName(rowFields, name)))).toEqual([...RESOURCE_RECORD_KEYS].sort())
  })
})
