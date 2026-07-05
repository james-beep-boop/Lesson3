/**
 * Adversarial coverage for the SAFE ARES extractors (`src/ingest/extract.ts`) — the codebase's
 * highest-risk security boundary (SPEC §7: parse, NEVER execute). Until now the contract was
 * enforced by review only; this suite pins it in CI so a future "small" widening of
 * `literalToJson` (a new operator, a relaxed fold) goes red immediately (audit 2026-07-04,
 * Phase 2 invariant tripwires). DB-free → `test:unit`.
 *
 * Structure: (1) the ARES data-module conventions that MUST extract; (2) every dynamic/executable
 * construct that MUST throw IngestError — never run; (3) the never-executes proof: a module whose
 * inert statements would leave a global marker if anything evaluated them; (4) the JSON sibling's
 * structural guards.
 */
import { describe, it, expect } from 'vitest'

import { extractAresData, extractAresJson } from '../../src/ingest/extract'
import { IngestError } from '../../src/ingest/errors'

/** Wrap a body in the five required groups so single-construct probes stay terse. */
const moduleWith = (metaExpr: string, extra = ''): string => `
'use strict';
${extra}
const META = ${metaExpr};
const UNIT = {};
const LESSONS = [];
const FINAL_EXPLANATION = {};
const SUMMARY_TABLE = {};
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
`

const expectRejected = (source: string, pattern?: RegExp) => {
  try {
    extractAresData(source)
    expect.unreachable('extractAresData should have thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(IngestError)
    if (pattern) expect((e as Error).message).toMatch(pattern)
  }
}

describe('extractAresData — accepts the ARES data-module conventions', () => {
  it('extracts consts re-exported by name, folding string concatenation', () => {
    const out = extractAresData(`
'use strict';
const META = {
  subject: 'Biology',
  grade: 10,
  deep: { list: [1, -2, 3.5, true, false, null] },
  prose: 'Line one.\\n' + '- bullet two\\n' + 'tail',
  tpl: \`plain template\`,
  'quoted key': 'ok',
};
const UNIT = {};
const LESSONS = [{ number: 1, title: 'L1' }];
const FINAL_EXPLANATION = { sections: [] };
const SUMMARY_TABLE = { lessons: [] };
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
`)
    expect(out.META).toEqual({
      subject: 'Biology',
      grade: 10,
      deep: { list: [1, -2, 3.5, true, false, null] },
      prose: 'Line one.\n- bullet two\ntail',
      tpl: 'plain template',
      'quoted key': 'ok',
    })
    expect(out.LESSONS).toEqual([{ number: 1, title: 'L1' }])
  })

  it('accepts inline literals in the exports object and last-assignment-wins', () => {
    const out = extractAresData(`
const META = { v: 'first' };
const UNIT = {};
const LESSONS = [];
const FINAL_EXPLANATION = {};
const SUMMARY_TABLE = {};
module.exports = { META: { v: 'inline' }, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
module.exports = { META, UNIT, LESSONS, FINAL_EXPLANATION, SUMMARY_TABLE };
`)
    expect(out.META).toEqual({ v: 'first' }) // the LAST module.exports assignment won
  })
})

describe('extractAresData — rejects every dynamic/executable construct', () => {
  it('rejects calls, identifier references, and member access inside data', () => {
    expectRejected(moduleWith(`foo()`), /Unsupported expression/)
    expectRejected(moduleWith(`{ a: someVar }`), /Unsupported expression/)
    expectRejected(moduleWith(`{ a: process.env }`), /Unsupported expression/)
    expectRejected(moduleWith(`(() => ({}))()`), /Unsupported expression/)
    expectRejected(moduleWith(`new Date()`), /Unsupported expression/)
  })

  it('rejects templates with expressions, spread, computed keys, getters, methods', () => {
    expectRejected(moduleWith('`x${1}`'), /Template literals with/)
    expectRejected(moduleWith(`{ ...other }`), /Spread/)
    expectRejected(moduleWith(`[...list]`), /Spread/)
    expectRejected(moduleWith(`{ ['k']: 1 }`), /Computed keys/)
    expectRejected(moduleWith(`{ get a() { return 1 } }`), /Getters/)
    expectRejected(moduleWith(`{ a() { return 1 } }`), /methods/)
  })

  it('rejects non-`+` operators and `+` on non-primitive operands', () => {
    expectRejected(moduleWith(`{ a: 2 - 1 }`), /only '\+'/)
    expectRejected(moduleWith(`{ a: 'x' * 2 }`), /only '\+'/)
    expectRejected(moduleWith(`{ a: [] + [] }`), /operands must be string or number literals/)
    expectRejected(moduleWith(`{ a: 'x' + foo }`), /Unsupported expression/)
    expectRejected(moduleWith(`{ a: !true }`), /Unsupported unary/)
  })

  it('rejects regex/bigint literals and sparse arrays', () => {
    expectRejected(moduleWith(`{ a: /re/ }`), /Regex/)
    expectRejected(moduleWith(`{ a: 1n }`), /BigInt/)
    expectRejected(moduleWith(`[1, , 2]`), /Sparse/)
  })

  it('rejects `__proto__` keys in data AND at the export layer', () => {
    expectRejected(moduleWith(`{ '__proto__': { polluted: true } }`), /__proto__/)
    expectRejected(moduleWith(`{ nested: { deep: { __proto__: 1 } } }`), /__proto__/)
    expectRejected(
      `const META = {}; module.exports = { META, UNIT: {}, LESSONS: [], FINAL_EXPLANATION: {}, SUMMARY_TABLE: {}, '__proto__': {} };`,
      /__proto__/,
    )
  })

  it('rejects malformed export shapes', () => {
    expectRejected(`const META = {};`, /No .module\.exports/)
    expectRejected(`module.exports = buildAll();`, /plain object literal/)
    expectRejected(
      `module.exports = { META, UNIT: {}, LESSONS: [], FINAL_EXPLANATION: {}, SUMMARY_TABLE: {} };`,
      /references undefined/,
    )
    expectRejected(
      `const META = {}; const UNIT = {}; module.exports = { META, UNIT };`,
      /missing required export/,
    )
    expectRejected(`not javascript at all ~~~`, /Could not parse/)
  })
})

describe('extractAresData — never executes the input', () => {
  it('ignores inert executable statements without running them', () => {
    const g = globalThis as Record<string, unknown>
    delete g.__extract_pwned
    // Top-level statements OTHER than const declarations and module.exports are ignored — they must
    // be IGNORED, not evaluated. If any of these ran, the global marker would be set.
    const out = extractAresData(
      moduleWith(
        `{ ok: true }`,
        `
globalThis.__extract_pwned = 'via statement';
if (true) { globalThis.__extract_pwned = 'via if'; }
function pwn() { globalThis.__extract_pwned = 'via fn'; }
`,
      ),
    )
    expect(out.META).toEqual({ ok: true })
    expect(g.__extract_pwned).toBeUndefined()
  })

  it('does not evaluate a non-exported const with dynamic content', () => {
    const g = globalThis as Record<string, unknown>
    delete g.__extract_pwned
    // The dynamic const is never referenced by module.exports → never evaluated (lazy pass 2).
    const out = extractAresData(
      moduleWith(`{ ok: 1 }`, `const TRAP = (globalThis.__extract_pwned = true);`),
    )
    expect(out.META).toEqual({ ok: 1 })
    expect(g.__extract_pwned).toBeUndefined()
  })
})

describe('extractAresJson — structural guards on the JSON sibling', () => {
  const groups = `"UNIT": {}, "LESSONS": [], "FINAL_EXPLANATION": {}, "SUMMARY_TABLE": {}`

  it('accepts a well-formed bundle', () => {
    const out = extractAresJson(`{ "META": { "subject": "Biology" }, ${groups} }`)
    expect(out.META).toEqual({ subject: 'Biology' })
  })

  it('rejects a non-object root, missing groups, and invalid JSON', () => {
    expect(() => extractAresJson(`[1, 2]`)).toThrow(IngestError)
    expect(() => extractAresJson(`"string"`)).toThrow(IngestError)
    expect(() => extractAresJson(`{ "META": {} }`)).toThrow(/missing required group/)
    expect(() => extractAresJson(`{ nope `)).toThrow(/Could not parse/)
  })

  it('rejects `__proto__` keys at any depth', () => {
    expect(() =>
      extractAresJson(`{ "META": { "a": { "__proto__": { "x": 1 } } }, ${groups} }`),
    ).toThrow(/__proto__/)
    expect(() =>
      extractAresJson(`{ "META": {}, "__proto__": {}, ${groups} }`),
    ).toThrow(/__proto__/)
    expect(() =>
      extractAresJson(`{ "META": {}, "LESSONS": [{ "__proto__": 1 }], "UNIT": {}, "FINAL_EXPLANATION": {}, "SUMMARY_TABLE": {} }`),
    ).toThrow(/__proto__/)
  })
})
