import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { extractAresData, extractAresJson } from '../../src/ingest/extract.js'
import { prepareUploadFiles } from '../../src/ingest/uploadFiles.js'
const outcomes: { case: string; result: string }[] = []
const emit = (meta: string, extra = '') =>
  `${extra}\nconst META=${meta}; const UNIT={}; const LESSONS=[]; const FINAL_EXPLANATION={}; const SUMMARY_TABLE={}; module.exports={META,UNIT,LESSONS,FINAL_EXPLANATION,SUMMARY_TABLE};`
const sentinel = globalThis as typeof globalThis & { AUDIT_EXECUTION_SENTINEL?: number }
sentinel.AUDIT_EXECUTION_SENTINEL = 0
for (const [name, source] of [
  ['call initializer', emit('(()=>{globalThis.AUDIT_EXECUTION_SENTINEL=1;return {}})()')],
  ['getter', emit('{get grade(){globalThis.AUDIT_EXECUTION_SENTINEL=1;return 9}}')],
  ['computed key', emit('{["g"+"rade"]:9}')],
  ['spread', emit('{...{grade:9}}')],
  [
    'interpolated template',
    emit('{note:`value ${(()=>{globalThis.AUDIT_EXECUTION_SENTINEL=1;return 1})()}`}'),
  ],
  ['prototype key', emit('{"__proto__":{polluted:true}}')],
] as const) {
  assert.throws(() => extractAresData(source))
  assert.equal(sentinel.AUDIT_EXECUTION_SENTINEL, 0)
  outcomes.push({ case: name, result: 'refused without execution' })
}
const inert = extractAresData(
  emit('{note:`plain template`}', 'globalThis.AUDIT_EXECUTION_SENTINEL=1;'),
)
assert.equal(sentinel.AUDIT_EXECUTION_SENTINEL, 0)
assert.deepEqual(inert.META, { note: 'plain template' })
outcomes.push({
  case: 'unrelated top-level executable statement and plain template',
  result: 'statement ignored, template accepted, nothing executed',
})
for (const [name, text] of [
  ['prototype JSON', '{"__proto__":{"polluted":true}}'],
  ['malformed JSON', '{"META":'],
  ['scalar JSON', '42'],
] as const) {
  assert.throws(() => extractAresJson(text))
  outcomes.push({ case: name, result: 'refused' })
}
const expansion = new JSZip()
expansion.file('large.json', ' '.repeat(6 * 1024 * 1024))
const bomb = await expansion.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
const bounded = await prepareUploadFiles([new File([new Uint8Array(bomb)], 'expansion.zip')])
assert.equal(bounded.items.length, 1)
await assert.rejects(async () => bounded.items[0].extract(), /limit/)
outcomes.push({
  case: 'high compression expands beyond per-file cap',
  result: 'refused during inflation',
})
const tooMany = new JSZip()
for (let i = 0; i < 1001; i++) tooMany.file(`${i}.json`, '{}')
const many = await tooMany.generateAsync({ type: 'uint8array' })
const counted = await prepareUploadFiles([new File([new Uint8Array(many)], 'many.zip')])
assert.ok(counted.rejected.some((x) => x.error.includes('Too many ZIP entries')))
outcomes.push({ case: '1001-entry ZIP', result: 'refused by central-directory pre-count' })
for (const [name, bytes] of [
  ['truncated ZIP', new Uint8Array([80, 75, 3, 4, 0])],
  ['empty ZIP bytes', new Uint8Array()],
] as const) {
  const r = await prepareUploadFiles([new File([bytes], 'broken.zip')])
  assert.equal(r.items.length, 0)
  assert.ok(r.rejected.length)
  outcomes.push({ case: name, result: 'refused' })
}
for (const name of ['data.js', 'data.docx']) {
  const r = await prepareUploadFiles([new File(['{}'], name)])
  assert.equal(r.items.length, 0)
  assert.ok(r.rejected.length)
  outcomes.push({ case: name, result: 'web route refuses unsupported extension' })
}
assert.equal(sentinel.AUDIT_EXECUTION_SENTINEL, 0)
delete sentinel.AUDIT_EXECUTION_SENTINEL
console.log(
  JSON.stringify({ source: '6e75a173e822e4c4be42821b0a4af48ca457bd36', outcomes }, null, 2),
)
