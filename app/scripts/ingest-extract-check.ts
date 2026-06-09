/**
 * Phase 3 ingest GATE — standalone, no Lesson3 DB.
 *
 * Proves two things about the safe `.js → JSON` extractor (src/ingest/extract.ts):
 *   1. PARITY: statically extracting `bio_1_4_data.js` yields EXACTLY what executing the
 *      module yields. The oracle `require()`s the trusted demo file — execution is used
 *      ONLY here, in the test, as the ground truth; never in the product path.
 *   2. SAFETY: adversarial modules (a `require` in data, a member access, a template with
 *      an expression, an identifier reference, an IIFE, a binary op, a `__proto__` key,
 *      a malformed export) are all REJECTED — and a benign-but-unexpected top-level
 *      statement is NEVER executed (a global "canary" stays unset).
 * Plus a couple of `validateGeneratable` (completeness-gate) assertions.
 *
 * Run:  cd app && npx tsx scripts/ingest-extract-check.ts
 */
import { createRequire } from 'node:module'
import { deepStrictEqual } from 'node:assert'
import path from 'node:path'
import os from 'node:os'

import { extractAresData } from '../src/ingest/extract'
import { IngestError } from '../src/ingest/errors'
import { rawToBundle } from '../src/ingest/toBundle'
import { deliverableWarnings, validateGeneratable } from '../src/ingest/validateGeneratable'

const require = createRequire(import.meta.url)
// Stakeholder-approved fixture set. Defaults to the local convention; override with
// ARES_DEMO_PATH on CI / the Rock / another machine where the fixtures live elsewhere.
const DEMO = process.env.ARES_DEMO_PATH ?? path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')
const BIO = path.join(DEMO, 'bio_1_4_data.js')

let passed = 0
let failed = 0
const ok = (name: string) => {
  passed++
  console.log(`  ✓ ${name}`)
}
const bad = (name: string, detail: string) => {
  failed++
  console.log(`  ✗ ${name}\n      ${detail}`)
}

/** Assert that extracting `source` throws an IngestError (and never executes it). */
const expectReject = (name: string, source: string) => {
  try {
    extractAresData(source)
    bad(name, 'expected IngestError, but extraction succeeded')
  } catch (e) {
    if (e instanceof IngestError) ok(name)
    else bad(name, `threw a non-IngestError: ${(e as Error).message}`)
  }
}

// A minimal valid module with ONE injected META member — so the only reason to reject is
// the injection itself.
const moduleWith = (metaInjection: string) => `
'use strict';
const META = { subject: "Biology", grade: 10, ${metaInjection} };
const UNIT = {};
const LESSONS = [{ slo: {}, summaryTablePrompt: {}, framework: [{ phase: "Observe Phase" }] }];
const FINAL_EXPLANATION = {};
const SUMMARY_TABLE = {};
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
`

console.log('Phase 3 ingest extraction gate:')

// 1. PARITY — static extraction == module execution (oracle).
try {
  const oracle = require(BIO) as Record<string, unknown>
  const extracted = extractAresData(require('node:fs').readFileSync(BIO, 'utf8'))
  // The oracle's `module.exports` includes exactly the five groups; compare them.
  deepStrictEqual(
    extracted,
    {
      META: oracle.META,
      UNIT: oracle.UNIT,
      LESSONS: oracle.LESSONS,
      FINAL_EXPLANATION: oracle.FINAL_EXPLANATION,
      SUMMARY_TABLE: oracle.SUMMARY_TABLE,
    },
    'extracted JSON differs from executed module',
  )
  ok('parity: extract(bio_1_4) deep-equals require(bio_1_4)')
} catch (e) {
  bad('parity: extract(bio_1_4) deep-equals require(bio_1_4)', (e as Error).message)
}

// 2. SAFETY — non-execution canary. A benign top-level statement must NOT run.
{
  const key = '__INGEST_CANARY__'
  const g = globalThis as Record<string, unknown>
  delete g[key]
  const source = `
'use strict';
globalThis.${key} = 'EXECUTED';
const META = { subject: "Biology", grade: 10 };
const UNIT = {};
const LESSONS = [{ slo: {}, summaryTablePrompt: {}, framework: [{ phase: "Observe Phase" }] }];
const FINAL_EXPLANATION = {};
const SUMMARY_TABLE = {};
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
`
  try {
    extractAresData(source) // should succeed (valid module) and NOT execute the assignment
    if (g[key] === undefined) ok('safety: benign top-level statement is never executed (canary unset)')
    else bad('safety: non-execution canary', `canary was set to ${String(g[key])} — code executed!`)
  } catch (e) {
    bad('safety: non-execution canary', `unexpected throw: ${(e as Error).message}`)
  } finally {
    delete g[key]
  }
}

// 2b. SAFETY — adversarial constructs in data are rejected, none executed.
expectReject('reject: require() call in data', moduleWith(`evil: require('child_process')`))
expectReject('reject: member access (process.env) in data', moduleWith(`evil: process.env.HOME`))
expectReject('reject: template literal with expression', moduleWith('evil: `${1 + 1}`'))
expectReject('reject: bare identifier reference in data', moduleWith(`evil: someVariable`))
expectReject('reject: IIFE / arrow call in data', moduleWith(`evil: (() => 1)()`))
// Constant `+` folds (below), but `+` with a NON-literal operand must still reject —
// proving the fold can't smuggle in an identifier/call.
expectReject('reject: binary `+` with a non-literal operand', moduleWith(`evil: 1 + someVar`))
expectReject('reject: non-`+` binary operator', moduleWith(`evil: 6 * 7`))
expectReject('reject: __proto__ key (prototype pollution)', moduleWith(`__proto__: { polluted: true }`))
expectReject(
  'reject: __proto__ key in module.exports (export layer)',
  `'use strict';
const META = {}; const UNIT = {}; const LESSONS = [];
const FINAL_EXPLANATION = {}; const SUMMARY_TABLE = {};
module.exports = { __proto__: META, META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };`,
)
expectReject(
  'reject: module.exports references an undefined identifier',
  `'use strict';
const META = {}; const UNIT = {}; const LESSONS = [];
const FINAL_EXPLANATION = {}; const SUMMARY_TABLE = {};
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE, EXTRA };`,
)
expectReject(
  'reject: no module.exports',
  `'use strict'; const META = {}; const UNIT = {}; const LESSONS = [];`,
)

// 2c. FOLD — constant string concatenation (the ARES multi-line-string pattern) folds.
{
  const r = extractAresData(moduleWith(`note: 'a\\n' + 'b' + 'c'`)) as { META: { note?: unknown } }
  if (r.META.note === 'a\nbc') ok("fold: constant string concatenation (+) folds to one string")
  else bad("fold: constant string concatenation (+) folds", `got ${JSON.stringify(r.META.note)}`)
}

// 3. COMPLETENESS GATE — validateGeneratable on real + broken data.
{
  const oracle = require(BIO) as Record<string, unknown>
  const problems = validateGeneratable(
    rawToBundle(extractAresData(require('node:fs').readFileSync(BIO, 'utf8'))),
  )
  if (problems.length === 0) ok('completeness: bio_1_4 is generatable (0 problems)')
  else bad('completeness: bio_1_4 is generatable', `unexpected problems: ${problems.join('; ')}`)
  void oracle

  // A lesson missing `slo` / a phase outside the vocab must be flagged.
  const broken = validateGeneratable({
    meta: { subject: 'X' },
    lessons: [{ summaryTablePrompt: {}, framework: [{ phase: 'Bogus Phase' }] }],
  })
  const flagsSlo = broken.some((p) => /missing SLO/i.test(p))
  const flagsPhase = broken.some((p) => /invalid phase/i.test(p))
  if (flagsSlo && flagsPhase) ok('completeness: missing slo + bad phase are flagged')
  else bad('completeness: missing slo + bad phase are flagged', `got: ${broken.join('; ') || '(none)'}`)

  // Deliverable warnings (WARN-ONLY): bio_1_4 carries FE + ST (no warnings); an empty
  // bundle warns for both missing documents.
  const bioWarnings = deliverableWarnings(
    rawToBundle(extractAresData(require('node:fs').readFileSync(BIO, 'utf8'))),
  )
  if (bioWarnings.length === 0) ok('deliverables: bio_1_4 produces all three documents (no warnings)')
  else bad('deliverables: bio_1_4 produces all three documents', `unexpected: ${bioWarnings.join('; ')}`)

  const emptyWarnings = deliverableWarnings({ meta: {}, lessons: [], finalExplanation: {}, summaryTable: {} })
  const warnsFE = emptyWarnings.some((w) => /FINAL_EXPLANATION/.test(w))
  const warnsST = emptyWarnings.some((w) => /SUMMARY_TABLE/.test(w))
  if (warnsFE && warnsST) ok('deliverables: empty FE/ST produce warn-only warnings')
  else bad('deliverables: empty FE/ST produce warn-only warnings', `got: ${emptyWarnings.join('; ') || '(none)'}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
