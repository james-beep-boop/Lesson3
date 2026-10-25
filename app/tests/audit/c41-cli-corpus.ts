/** Exercise the real static extractor; source strings are never evaluated. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { extractAresData } from '../../src/ingest/extract'

const output = process.env.LESSON3_AUDIT_RESULT_FILE
assert(output)
const globals = globalThis as typeof globalThis & { __lesson3AuditExecuted?: boolean }
assert.equal(globals.__lesson3AuditExecuted, undefined)
const moduleSource = (expression: string) =>
  `const META = ${expression}; const UNIT=null; const LESSONS=[]; const FINAL_EXPLANATION=null; const SUMMARY_TABLE=null; module.exports={META,UNIT,LESSONS,FINAL_EXPLANATION,SUMMARY_TABLE};`
const cases: Array<[string, string, boolean]> = [
  ['literal', moduleSource('{subject:"Synthetic",grade:10}'), true],
  ['constant-template', moduleSource('{text:`constant`}'), true],
  ['constant-concat', moduleSource('{text:"a"+"b",number:1+2,negative:-2}'), true],
  ['inert-top-level', 'globalThis.__lesson3AuditExecuted=true;' + moduleSource('{}'), true],
  [
    'inert-unexported-call',
    'const unused=(()=>{globalThis.__lesson3AuditExecuted=true})() ;' + moduleSource('{}'),
    true,
  ],
  [
    'exported-call',
    moduleSource('(()=>{globalThis.__lesson3AuditExecuted=true;return {}})()'),
    false,
  ],
  [
    'getter',
    moduleSource('{get text(){globalThis.__lesson3AuditExecuted=true;return "x"}}'),
    false,
  ],
  ['setter', moduleSource('{set text(value){globalThis.__lesson3AuditExecuted=true}}'), false],
  ['method', moduleSource('{text(){globalThis.__lesson3AuditExecuted=true}}'), false],
  ['computed-key', moduleSource('{["subject"]:"x"}'), false],
  ['object-spread', moduleSource('{...{subject:"x"}}'), false],
  ['array-spread', moduleSource('{data:[...[1]]}'), false],
  ['member-access', moduleSource('{text:process.env.HOME}'), false],
  ['identifier', moduleSource('{text:undefined}'), false],
  ['interpolation', moduleSource('{text:`${globalThis.__lesson3AuditExecuted=true}`}'), false],
  ['regex', moduleSource('{text:/x/}'), false],
  ['bigint', moduleSource('{number:1n}'), false],
  ['prototype', moduleSource('{__proto__:{polluted:true}}'), false],
  [
    'export-prototype',
    moduleSource('{}').replace('module.exports={', 'module.exports={__proto__:{polluted:true},'),
    false,
  ],
  ['sparse-array', moduleSource('{data:[,]}'), false],
  ['new-expression', moduleSource('new Object()'), false],
  [
    'function-expression',
    moduleSource('function(){globalThis.__lesson3AuditExecuted=true}'),
    false,
  ],
  ['binary-coercion', moduleSource('{text:[]+"x"}'), false],
  ['binary-subtract', moduleSource('{number:2-1}'), false],
  [
    'dynamic-export',
    moduleSource('{}').replace(
      'module.exports={META,UNIT,LESSONS,FINAL_EXPLANATION,SUMMARY_TABLE}',
      'module.exports=Object.assign({},{META,UNIT,LESSONS,FINAL_EXPLANATION,SUMMARY_TABLE})',
    ),
    false,
  ],
  [
    'computed-export',
    moduleSource('{}').replace('module.exports={META,', 'module.exports={["META"]:META,'),
    false,
  ],
  ['missing-export', 'module.exports={META:{}}', false],
  ['json-as-js', '{"META":{}}', false],
  ['json-js-polyglot', '{"META":{}};globalThis.__lesson3AuditExecuted=true;', false],
]
const results = cases.map(([name, source, expected]) => {
  let accepted = false
  let error: string | undefined
  try {
    extractAresData(source)
    accepted = true
  } catch (cause) {
    error = String(cause)
  }
  assert.equal(accepted, expected, name)
  assert.equal(globals.__lesson3AuditExecuted, undefined, `${name}: execution sentinel`)
  assert.equal(({} as Record<string, unknown>).polluted, undefined)
  return {
    name,
    source,
    sha256: createHash('sha256').update(source).digest('hex'),
    accepted,
    expected,
    error,
  }
})
await writeFile(
  output,
  JSON.stringify({ node: process.version, results, sentinelUnchanged: true }, null, 2),
  { mode: 0o600 },
)
console.log(
  JSON.stringify({
    cases: results.length,
    accepted: results.filter((x) => x.accepted).length,
    sentinelUnchanged: true,
  }),
)
