#!/usr/bin/env node
/**
 * Compare two computed-style dumps from `pages.spec.ts` or `dialogs.spec.ts`, or the two surfaces in
 * one `menu-states.spec.ts` dump. See README.md in this directory.
 *
 *   node tests/style-snapshot/diff.mjs before.json after.json [--ignore=width,height]
 *   node tests/style-snapshot/diff.mjs --surfaces states.json
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const ignore = new Set(
  (args.find((a) => a.startsWith('--ignore='))?.slice('--ignore='.length) ?? '')
    .split(',')
    .filter(Boolean),
)
const files = args.filter((a) => !a.startsWith('--'))
const load = (f) => JSON.parse(readFileSync(f, 'utf8'))

if (args.includes('--surfaces')) {
  // menu-states: { "desktop/app": { avatar: {...}, ... }, "desktop/admin": {...}, ... }
  const d = load(files[0])
  let total = 0
  for (const key of Object.keys(d).filter((k) => k.endsWith('/app'))) {
    const app = d[key]
    const admin = d[key.replace(/\/app$/, '/admin')] ?? {}
    for (const [part, a] of Object.entries(app)) {
      const b = admin[part]
      if (a === null || typeof a !== 'object' || b === null || typeof b !== 'object') {
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          console.log(`${key} ${part}: app ${JSON.stringify(a)} admin ${JSON.stringify(b)}`)
          total++
        }
        continue
      }
      const diff = Object.keys(a).filter((p) => !ignore.has(p) && a[p] !== b[p])
      for (const p of diff) console.log(`${key} ${part} ${p}: app ${a[p]} | admin ${b[p]}`)
      total += diff.length
    }
  }
  console.log(`total differences ${total}`)
} else {
  // Row dumps: { __props: [...], "<page>": ["path | v ; v ; …", …] }. Rows are matched by element path
  // in document order; a page whose element set changed reports the unmatched paths.
  const [a, b] = files.map(load)
  const props = a.__props ?? []
  // A row without ` | ` is a free-text note (the over-tall dialog's scroll probe): compared whole.
  const split = (row) => {
    const i = row.indexOf(' | ')
    return i < 0 ? ['(note)', [row]] : [row.slice(0, i), row.slice(i + 3).split(' ; ')]
  }
  const byPath = (rows) => {
    const m = new Map()
    for (const row of rows) {
      const [p, values] = split(row)
      if (!m.has(p)) m.set(p, [])
      m.get(p).push(values)
    }
    return m
  }
  let total = 0
  for (const page of Object.keys(a).filter((k) => k !== '__props')) {
    const ma = byPath(a[page])
    const mb = byPath(b[page] ?? [])
    const lines = []
    for (const [path, rowsA] of ma) {
      const rowsB = mb.get(path) ?? []
      if (rowsA.length !== rowsB.length)
        lines.push(`  ${path}: ${rowsA.length} → ${rowsB.length} elements`)
      rowsA.forEach((va, i) => {
        const vb = rowsB[i]
        if (!vb) return
        const changed = va
          .map((v, j) => [props[j] ?? `#${j}`, v, vb[j]])
          .filter(([name, x, y]) => !ignore.has(name) && x !== y)
        if (changed.length)
          lines.push(
            `  ${path.split('>').pop()}: ${changed.map(([n, x, y]) => `${n} ${x} → ${y}`).join('; ')}`,
          )
      })
    }
    for (const path of mb.keys()) if (!ma.has(path)) lines.push(`  ${path}: new`)
    if (lines.length) console.log(`== ${page}\n${lines.join('\n')}`)
    total += lines.length
  }
  console.log(`total differences ${total}`)
}
