/**
 * Contract drift report — validate ARES data files against the canonical contract
 * (src/ingest/ares-contract.schema.json) and print, per file, how each diverges.
 *
 * DB-less, parse-never-execute (same safe extractors as ingest). Use it to (a) see what a
 * bundle will warn about before ingesting, and (b) generate the drift report we send back to
 * ARES (see docs/ARES-DATA-REQUEST.md). It does NOT fail on drift — drift is the expected output;
 * it exits non-zero only if it can't read/parse a file.
 *
 * Run:  cd app && npx tsx scripts/contract-drift.ts -- <file.js | file.json | dir> [more…]
 * e.g.  npx tsx scripts/contract-drift.ts -- ~/Documents/GitHub/cbe-generation-system/generators/data
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { extractAresData, extractAresJson } from '../src/ingest/extract'
import { contractDrift } from '../src/ingest/contract'

const isDataFile = (f: string): boolean => f.endsWith('.js') || f.endsWith('.json')

function gather(inputs: string[]): string[] {
  const out = new Set<string>()
  for (const input of inputs) {
    const resolved = path.resolve(input)
    const st = statSync(resolved)
    if (st.isDirectory()) {
      for (const entry of readdirSync(resolved).sort()) {
        // Skip hidden files (e.g. editor/checkpoint dotfiles) — they aren't ARES bundles.
        if (!entry.startsWith('.') && isDataFile(entry)) out.add(path.join(resolved, entry))
      }
    } else if (isDataFile(resolved)) {
      out.add(resolved)
    } else {
      throw new Error(`Not a .js/.json file or directory: ${input}`)
    }
  }
  return [...out]
}

const extract = (file: string): Record<string, unknown> => {
  const src = readFileSync(file, 'utf8')
  return file.endsWith('.json') ? extractAresJson(src) : extractAresData(src)
}

function main() {
  const inputs = process.argv.slice(2).filter((a) => a !== '--')
  if (inputs.length === 0) {
    console.error('Usage: npx tsx scripts/contract-drift.ts -- <file.js | file.json | dir> [more…]')
    process.exit(1)
  }

  const files = gather(inputs)
  if (files.length === 0) {
    console.error(`No .js/.json files found at: ${inputs.join(', ')}`)
    process.exit(1)
  }

  console.log(`Contract drift vs src/ingest/ares-contract.schema.json — ${files.length} file(s)\n`)
  let conforming = 0
  let totalIssues = 0
  let unreadable = 0
  for (const file of files) {
    const name = path.basename(file)
    let drift: string[]
    try {
      drift = contractDrift(extract(file))
    } catch (e) {
      // Non-fatal: a single unreadable file shouldn't abort the report (it's drift too).
      unreadable++
      console.log(`✗ ${name} — could not read/parse: ${e instanceof Error ? e.message : e}`)
      continue
    }
    if (drift.length === 0) {
      conforming++
      console.log(`✓ ${name} — conforms`)
    } else {
      totalIssues += drift.length
      console.log(`• ${name} — ${drift.length} issue(s):`)
      for (const d of drift) console.log(`    - ${d}`)
    }
  }
  console.log(`\n${'='.repeat(50)}`)
  console.log(
    `${conforming}/${files.length} file(s) conform · ${totalIssues} total drift issue(s)` +
      (unreadable ? ` · ${unreadable} unreadable` : ''),
  )
}

main()
