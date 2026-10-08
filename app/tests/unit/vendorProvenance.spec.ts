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
    // `hasPipeTable` (proseLinks.ts) copies upstream's definition of a table (two or more consecutive pipe
    // rows), and the fields it exempts from linkification are exactly the ones upstream passes to `richCell`
    // or `stripTables` (the only places a Markdown table is parsed). None of these is exported in a way we can
    // import — a re-pin that changes any would silently desynchronise the two. Fail loudly here instead.
    const read = (file: string) => readFileSync(new URL(`vendor/lib/${file}`, GEN), 'utf8')
    const count = (src: string, re: RegExp) => src.match(re)?.length ?? 0
    const kit = read('docx_kit.js')
    expect(kit).toContain("const isPipeRow = ln => ln.trim().startsWith('|');")
    // A table is TWO OR MORE consecutive pipe rows; a lone `|x| = 3` line is maths. Both parsers say so.
    expect(count(kit, /if \(j - i < 2\)/g)).toBe(1) // richCell
    expect(count(kit, /if \(blk\.length < 2\)/g)).toBe(1) // stripTables

    const build = read('build_docs.js')
    expect(count(build, /richCell\(FE\.instructions/g)).toBe(1)
    expect(count(build, /richCell\(sec\.prompt/g)).toBe(2) // student + teacher
    expect(count(build, /richCell\(sec\.exemplar/g)).toBe(1) // teacher only
    expect(count(build, /\brichCell\(/g)).toBe(4) // exactly those four — no new table-capable field

    const sections = read('sections.js')
    expect(count(sections, /richCell\(lesson\.overview/g)).toBe(1)
    // The four framework fields are table-stripped (the table moves to a full-width row of its own), not
    // rendered in place; the pointer and the row are upstream's.
    expect(count(sections, /stripTables\(ph\[k\]\)/g)).toBe(1)
    expect(sections).toContain(
      "const cols = ['learnerExperience', 'teacherMoves', 'sensemakingStrategy', 'formativeAssessment'];",
    )
    expect(count(kit, /'\(table below\)'/g)).toBe(1)
    expect(count(sections, /\brichCell\(/g)).toBe(2) // overview + the full-width table row — nothing else
  })

  it('records the pinned commit the files were vendored from', () => {
    expect(record).toMatch(/Pinned commit:\*\* `[0-9a-f]{40}`/)
  })
})
