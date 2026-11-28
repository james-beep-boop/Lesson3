import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const vendor = fileURLToPath(new URL('../../src/decks/vendor/', import.meta.url))

it('matches the recorded SHA-256 for every vendored deck builder file', () => {
  const provenance = readFileSync(join(vendor, 'PROVENANCE.md'), 'utf8')
  const matches = provenance.matchAll(/^([0-9a-f]{64})  \.\/(.+)$/gm)
  const hashes = Object.fromEntries([...matches].map(([, hash, file]) => [file, hash]))
  const files = readdirSync(vendor, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(vendor, join(entry.parentPath, entry.name)))
    .filter((file) => file !== 'PROVENANCE.md' && file !== 'package.json')

  expect(Object.keys(hashes).sort()).toEqual(files.sort())
  for (const file of files) {
    const contents = readFileSync(join(vendor, file))
    const actual = createHash('sha256').update(contents).digest('hex')
    expect(actual, file).toBe(hashes[file])
  }
})
