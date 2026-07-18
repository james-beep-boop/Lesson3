/**
 * canonicalJson — the comparator behind save-as-new's no-op guard (2026-07-17). The http suite
 * only round-trips the SAME object, so it can never catch a canonicalization regression; these
 * pin the properties that are the helper's entire reason to exist: key order must not fake a
 * difference, while real differences (values, array order) must still show.
 */
import { describe, it, expect } from 'vitest'

import { canonicalJson } from '@/lib/canonicalJson'

describe('canonicalJson (no-op-save comparator)', () => {
  it('key order does not fake a difference — including in NESTED objects', () => {
    const a = { title: 'T', meta: { subject: 'Biology', grade: 10 }, lessons: [{ x: 1, y: 2 }] }
    const b = { lessons: [{ y: 2, x: 1 }], meta: { grade: 10, subject: 'Biology' }, title: 'T' }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('a differing nested value IS a difference', () => {
    const a = { meta: { subject: 'Biology' }, lessons: [{ overview: 'one' }] }
    const b = { meta: { subject: 'Biology' }, lessons: [{ overview: 'two' }] }
    expect(canonicalJson(a)).not.toBe(canonicalJson(b))
  })

  it('ARRAY order is content (lesson/framework rows) — reordering IS a difference', () => {
    expect(canonicalJson({ lessons: [1, 2] })).not.toBe(canonicalJson({ lessons: [2, 1] }))
  })

  it('normalizes like a REST round-trip: Date → ISO string, undefined-valued keys dropped', () => {
    const when = new Date('2026-07-17T00:00:00.000Z')
    expect(canonicalJson({ at: when })).toBe(canonicalJson({ at: '2026-07-17T00:00:00.000Z' }))
    expect(canonicalJson({ a: 1, gone: undefined })).toBe(canonicalJson({ a: 1 }))
  })

  it('null is preserved (a cleared field is not the same as an absent one)', () => {
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}))
  })
})
