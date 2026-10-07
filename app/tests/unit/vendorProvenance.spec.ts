/**
 * `vendor/PROVENANCE.md` is the record of WHAT was vendored. Its SHA-256 table is only worth anything if
 * it matches the bytes on disk, so this recomputes every hash. A hand edit to a "byte-pristine" vendored
 * file, a re-vendor that forgot to update the record, or an edited record all fail here.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const GEN = new URL('../../src/generator/', import.meta.url)
const sha = (rel: string) =>
  createHash('sha256')
    .update(readFileSync(new URL(rel, GEN)))
    .digest('hex')
const record = readFileSync(new URL('vendor/PROVENANCE.md', GEN), 'utf8')

/** `| \`lib/x.js\` | … | \`<sha>\` |` rows → { lesson3 path → sha } */
const table = Object.fromEntries(
  [...record.matchAll(/^\| `([^`]+)` \| `[^`]+` \| `([0-9a-f]{64})` \|$/gm)].map((m) => [
    m[1],
    m[2],
  ]),
)

describe('vendored generator provenance', () => {
  it.each(['lib/build_docs.js', 'lib/sections.js', 'lib/docx_kit.js', 'lib/attribution.js'])(
    '%s matches its recorded SHA-256',
    (file) => {
      expect(table[file], `${file} must be listed in PROVENANCE.md`).toBeDefined()
      expect(sha(`vendor/${file}`)).toBe(table[file])
    },
  )

  it('the pristine upstream attribution config matches its recorded SHA-256', () => {
    const rec = table['vendor/config/attribution.upstream.yaml']
    expect(rec).toBeDefined()
    expect(sha('vendor/config/attribution.upstream.yaml')).toBe(rec)
  })

  it('the fixed-year config differs from the pristine copy by exactly the year line', () => {
    const a = readFileSync(new URL('vendor/config/attribution.upstream.yaml', GEN), 'utf8').split(
      '\n',
    )
    const b = readFileSync(new URL('config/attribution.yaml', GEN), 'utf8').split('\n')
    expect(b.length).toBe(a.length)
    const changed = a.flatMap((line, i) => (line === b[i] ? [] : [[line, b[i]]]))
    expect(changed).toHaveLength(1)
    expect(changed[0]![0]).toMatch(/^year: auto/)
    expect(changed[0]![1]).toMatch(/^year: 2026\b/)
    // and the record names the shipped copy's hash
    expect(record).toContain(sha('config/attribution.yaml'))
  })

  it('the vendored table parser still has the shape proseLinks.ts mirrors', () => {
    // `hasPipeTableRow` (proseLinks.ts) copies upstream's definition of a table row, and the Final Explanation
    // fields it exempts from linkification (`prompt`, `exemplar`) are the ones upstream passes to `richCell`.
    // build_docs.js exports neither, so neither can be imported — a re-pin that changes either would silently
    // desynchronise the two. Fail loudly here instead.
    const src = readFileSync(new URL('vendor/lib/build_docs.js', GEN), 'utf8')
    expect(src).toContain("const isPipeRow = ln => ln.trim().startsWith('|');")
    expect(src.match(/richCell\(sec\.prompt/g)).toHaveLength(2) // student + teacher
    expect(src.match(/richCell\(sec\.exemplar/g)).toHaveLength(1) // teacher only
    expect(src.match(/\brichCell\(/g)).toHaveLength(4) // those three calls + the definition
  })

  it('records the pinned commit the files were vendored from', () => {
    expect(record).toMatch(/Pinned commit:\*\* `[0-9a-f]{40}`/)
  })
})
