// Generate synthetic inputs outside the checkout. Uses the application's pinned JSZip.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

const output = process.env.LESSON3_AUDIT_CORPUS_DIR
assert(output && path.isAbsolute(output) && !output.startsWith('/app/'))
await mkdir(output, { recursive: true, mode: 0o700 })
const subject = process.env.LESSON3_AUDIT_CORPUS_SUBJECT || 'ZZ_AUDIT_Synthetic_Science'
const fixedDate = new Date('2026-01-01T00:00:00Z')
const MiB = 1024 * 1024
let identity = 0
const groups = []
const files = []
export function bundle(label, name = subject, grade = 10) {
  return {
    schemaVersion: '1.0.0',
    META: {
      subject: name,
      grade,
      substrand_id: `991.c41.${++identity}`,
      substrand_name: label,
      titleDoc: `ZZ_AUDIT_C41_${label}`,
    },
    UNIT: null,
    LESSONS: [
      {
        number: 1,
        title: 'Synthetic lesson',
        duration: '40 minutes',
        slo: { purpose: 'p', knowledge: 'k', skills: 's', attitudes: 'a', keyInquiry: 'q' },
        framework: [
          {
            phase: 'Predict Phase',
            learnerExperience: 'x',
            teacherMoves: 'y',
            sensemakingStrategy: 'z',
            formativeAssessment: 'w',
          },
        ],
        summaryTablePrompt: { observed: 'o', learned: 'l', explained: 'e' },
        resourceLinks: Object.fromEntries(
          ['predict', 'observe', 'explain', 'dqb', 'model'].map((phase) => [
            phase,
            { video: null, reading: null, fallback_search_url: 'https://example.test/search' },
          ]),
        ),
      },
    ],
    FINAL_EXPLANATION: null,
    SUMMARY_TABLE: null,
  }
}
async function file(name, data, recipe) {
  const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
  await writeFile(path.join(output, name), bytes, { mode: 0o600 })
  const record = {
    name,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    recipe,
  }
  files.push(record)
  return name
}
async function zip(entries, compression = 'DEFLATE') {
  const archive = new JSZip()
  for (const [name, bytes] of entries)
    archive.file(name, bytes, { date: fixedDate, createFolders: false })
  return archive.generateAsync({ type: 'nodebuffer', compression, platform: 'UNIX' })
}
function group(name, names, http, count, recipe, fields = {}) {
  groups.push({ name, files: names, http, count, recipe, fields })
}
const json = (value) => JSON.stringify(value)
const control = await file(
  'role-control.json',
  json(bundle('role_control')),
  'Valid canonical JSON for role authorization control',
)
group(
  'role-control',
  [control],
  200,
  1,
  'Site Administrator imports; all other roles refuse before parsing',
)

const malformed = []
for (const key of ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__']) {
  for (const level of ['root', 'META', 'lesson']) {
    const raw = bundle(`${key}_${level}`)
    const object = level === 'root' ? raw : level === 'META' ? raw.META : raw.LESSONS[0]
    Object.defineProperty(object, key, { value: { smuggled: true }, enumerable: true })
    malformed.push(
      await file(`key-${key}-${level}.json`, json(raw), `Unexpected own key ${key} at ${level}`),
    )
  }
}
for (const [label, bytes] of [
  ['empty', ''],
  ['truncated', '{"META":'],
  ['array-root', '[]'],
  ['null-root', 'null'],
  ['js-as-json', 'module.exports = {};'],
  ['json-polyglot', json(bundle('polyglot')) + ';globalThis.__auditExecuted=true;'],
]) {
  malformed.push(await file(`${label}.json`, bytes, label))
}
for (const depth of [10000, 20000]) {
  const raw = json(bundle(`deep_${depth}`))
  malformed.push(
    await file(
      `deep-${depth}.json`,
      raw.slice(0, -1) + ',"deep":' + '['.repeat(depth) + '0' + ']'.repeat(depth) + '}',
      `Extra field containing ${depth} nested arrays; bounded input`,
    ),
  )
}
const mixedControl = await file(
  'mixed-control.json',
  json(bundle('mixed_control')),
  'Valid peer beside malformed files',
)
group(
  'malformed-json',
  [mixedControl, ...malformed],
  200,
  1,
  'All invalid files individually rejected; valid peer imports',
)

const badExtensions = []
for (const extension of ['js', 'docx', 'txt'])
  badExtensions.push(
    await file(
      `wrong.${extension}`,
      json(bundle(`wrong_${extension}`)),
      'Valid JSON bytes with unsupported extension',
    ),
  )
const extensionControl = await file(
  'extension-control.JSON',
  json(bundle('extension_control')),
  'Uppercase JSON extension accepted',
)
group(
  'extensions',
  [extensionControl, ...badExtensions],
  200,
  1,
  'Unsupported formats refused, uppercase JSON accepted',
)

const rawBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json(bundle('bom')))])
group(
  'plain-bom',
  [await file('bom.json', rawBom, 'UTF-8 BOM followed by valid JSON')],
  'observe',
  null,
  'Compare standalone and ZIP UTF-8 BOM handling',
)
group(
  'zip-bom',
  [
    await file(
      'bom.zip',
      await zip([['bom.json', rawBom]]),
      'Same BOM-prefixed JSON bytes as standalone case',
    ),
  ],
  'observe',
  null,
  'Same underlying bytes, different upload container',
)
const invalidUtf8 = Buffer.from(json(bundle('UTF8_MARKER')))
invalidUtf8[invalidUtf8.indexOf('UTF8_MARKER')] = 0xff
group(
  'invalid-utf8',
  [await file('invalid-utf8.json', invalidUtf8, 'FF byte inside META title/substrand text string')],
  'observe',
  null,
  'Observe replacement/error behavior; do not presume encoding policy',
)

const traversal = await zip([
  ['nested/good.JSON', json(bundle('nested'))],
  ['../../tmp/lesson3-c41-escape.json', json(bundle('traversal'))],
  ['notes.txt', 'not JSON'],
  ['__MACOSX/._notes.json', '{}'],
])
group(
  'zip-paths-and-skips',
  [
    await file(
      'paths.zip',
      traversal,
      'Two valid JSON entries, including traversal name, plus non-JSON/Mac metadata',
    ),
  ],
  200,
  2,
  'Import data in memory; no archive path may be written to disk',
)
group(
  'empty-zip',
  [await file('empty.zip', await zip([['notes.txt', 'x']]), 'Archive contains no JSON')],
  422,
  0,
  'No JSON entry to import',
)
group(
  'truncated-zip',
  [
    await file(
      'truncated.zip',
      traversal.subarray(0, traversal.length - 18),
      'Remove the end of central directory',
    ),
  ],
  422,
  0,
  'Truncated archive',
)

const many = await zip(
  Array.from({ length: 1001 }, (_, i) => [`${String(i).padStart(4, '0')}.txt`, 'x']),
)
group(
  'zip-entry-overflow',
  [await file('entries-1001.zip', many, '1001 actual central directory records')],
  422,
  0,
  'Reject before JSZip builds entry objects',
)
const declared = Buffer.from(many)
let eocd = declared.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
declared.writeUInt16LE(1, eocd + 8)
declared.writeUInt16LE(1, eocd + 10)
group(
  'zip-forged-count',
  [await file('declares-one.zip', declared, '1001 directory records but EOCD declares one')],
  422,
  0,
  'Actual record count remains authoritative',
)
const collapsed = Buffer.from(many)
for (let i = 1; i < 1001; i++) {
  const name = `${String(i).padStart(4, '0')}.txt`
  for (let at = collapsed.indexOf(name); at >= 0; at = collapsed.indexOf(name, at + 1))
    collapsed.write('0000.txt', at)
}
group(
  'zip-duplicate-count',
  [
    await file(
      'duplicate-1001.zip',
      collapsed,
      'Rewrite all 1001 names identically without removing directory records',
    ),
  ],
  422,
  0,
  'Parsed-name collapse must not bypass entry cap',
)

function zip64(bytes, locatorDelta = 0n) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const out = Buffer.alloc(end + 56 + 20 + 22)
  bytes.copy(out, 0, 0, end)
  out.writeUInt32LE(0x06064b50, end)
  out.writeBigUInt64LE(44n, end + 4)
  const n = BigInt(bytes.readUInt16LE(end + 10))
  out.writeBigUInt64LE(n, end + 24)
  out.writeBigUInt64LE(n, end + 32)
  out.writeBigUInt64LE(BigInt(bytes.readUInt32LE(end + 12)), end + 40)
  out.writeBigUInt64LE(BigInt(bytes.readUInt32LE(end + 16)), end + 48)
  out.writeUInt32LE(0x07064b50, end + 56)
  out.writeBigUInt64LE(BigInt(end) + locatorDelta, end + 64)
  out.writeUInt32LE(1, end + 72)
  bytes.copy(out, end + 76, end, end + 22)
  for (const offset of [4, 6, 8, 10]) out.writeUInt16LE(0xffff, end + 76 + offset)
  out.writeUInt32LE(0xffffffff, end + 88)
  out.writeUInt32LE(0xffffffff, end + 92)
  return out
}
const smallZip = await zip([['zip64.json', json(bundle('zip64'))]])
group(
  'zip64-valid',
  [await file('valid-zip64.zip', zip64(smallZip), 'Small valid ZIP64 archive')],
  200,
  1,
  'Positive ZIP64 control',
)
group(
  'zip64-overflow-locator',
  [
    await file(
      'overflow-zip64.zip',
      zip64(smallZip, 1n << 32n),
      'Locator offset increased by 2^32',
    ),
  ],
  422,
  0,
  'Reject parser offset divergence',
)

const duplicateNames = await zip([
  ['first.json', json(bundle('duplicate_first'))],
  ['other.json', json(bundle('duplicate_second'))],
])
for (
  let at = duplicateNames.indexOf('other.json');
  at >= 0;
  at = duplicateNames.indexOf('other.json', at + 1)
)
  duplicateNames.write('first.json', at)
group(
  'zip-duplicate-filenames',
  [
    await file(
      'duplicate-names.zip',
      duplicateNames,
      'Two distinct valid bundles with identical ZIP path names',
    ),
  ],
  'observe',
  null,
  'Observe omission/warning semantics separately from record-cap protection',
)
const crc = await zip([['crc.json', json(bundle('CRC_ORIGINAL'))]], 'STORE')
const mark = crc.indexOf('CRC_ORIGINAL')
assert(mark >= 0)
crc.write('CRC_MODIFIED', mark)
group(
  'zip-bad-crc',
  [await file('bad-crc.zip', crc, 'Mutate stored JSON text without updating ZIP CRC32')],
  'observe',
  null,
  'Observe bounded per-entry integrity behavior; CRC is not authentication',
)

const bigRaw = json(bundle('expanded'))
const oversized = ' '.repeat(5 * MiB + 1 - Buffer.byteLength(bigRaw)) + bigRaw
group(
  'plain-file-too-large',
  [await file('too-large.json', oversized, 'Valid JSON padded to 5MiB+1 bytes')],
  422,
  0,
  'Per-file byte cap before parse',
)
const exactRaw = json(bundle('exact_file_limit'))
group(
  'plain-file-exact-limit',
  [
    await file(
      'exact-limit.json',
      ' '.repeat(5 * MiB - Buffer.byteLength(exactRaw)) + exactRaw,
      'Valid JSON padded to exactly 5MiB',
    ),
  ],
  200,
  1,
  'Boundary positive control',
)
const bomb = await zip([['bomb.json', oversized]])
group(
  'zip-file-expansion',
  [await file('expansion.zip', bomb, 'Highly compressed JSON expands beyond 5MiB')],
  422,
  0,
  'Actual inflated bytes bounded',
)
const dishonest = Buffer.from(bomb)
dishonest.writeUInt32LE(1, 22)
const central = dishonest.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
assert(central >= 0)
dishonest.writeUInt32LE(1, central + 24)
group(
  'zip-dishonest-size',
  [
    await file(
      'dishonest-size.zip',
      dishonest,
      'Expanded length metadata says one byte, actual data exceeds 5MiB',
    ),
  ],
  422,
  0,
  'Metadata cannot bypass streaming byte checks',
)
group(
  'zip-json-count',
  [
    await file(
      'json-501.zip',
      await zip(Array.from({ length: 501 }, (_, i) => [`${i}.json`, '{}'])),
      '501 JSON entries below the 1000-record ZIP cap',
    ),
  ],
  400,
  0,
  'Combined JSON-count guard rejects before writes',
)
const expanded = []
for (let i = 0; i < 41; i++) {
  const raw = json(bundle(`combined_${i}`))
  expanded.push([`${i}.json`, ' '.repeat(5 * MiB - Buffer.byteLength(raw)) + raw])
}
group(
  'zip-total-expansion',
  [
    await file(
      'total-expansion.zip',
      await zip(expanded),
      '41 valid 5MiB JSON files,205MiB expanded,compact compressed upload',
    ),
  ],
  400,
  0,
  'Global200MiB budget aborts preparation before DB writes',
)

const duplicate = bundle('duplicate_identity')
group(
  'duplicate-bundle-identity',
  [
    await file('identity-a.json', json(duplicate), 'Same taxonomy/substrand identity as peer'),
    await file('identity-b.json', json(duplicate), 'Same identity,distinct upload filename'),
  ],
  422,
  0,
  'Every member of duplicate semantic identity group refused',
)
const missing = bundle('missing_taxonomy', 'ZZ_AUDIT_C41_New_Subject', 9)
group(
  'taxonomy-no-consent',
  [
    await file('missing.json', json(missing), 'Valid new taxonomy requiring approval'),
    await file(
      'held-valid.json',
      json(bundle('held_valid')),
      'Existing taxonomy file must also wait',
    ),
  ],
  409,
  0,
  'Consent boundary holds whole batch',
)
group(
  'stray-taxonomy-consent',
  [await file('stray.json', json(bundle('stray')), 'Already-existing taxonomy')],
  400,
  0,
  'Unneeded approval rejected',
  { createTaxonomy: json([{ subject: 'ZZ_AUDIT_C41_Unneeded', grade: 9 }]) },
)
const near = bundle('near_miss', subject.toLowerCase(), 10)
group(
  'taxonomy-case-clash',
  [await file('near-miss.json', json(near), 'Subject differs only by case')],
  422,
  0,
  'Do not create or map near-miss taxonomy',
)

await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify({ node: process.version, jszip: JSZip.version, groups, files }, null, 2),
  { mode: 0o600 },
)
console.log(
  JSON.stringify({
    groups: groups.length,
    files: files.length,
    corpusBytes: files.reduce((n, f) => n + f.bytes, 0),
  }),
)
