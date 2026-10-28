import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { generateBundleDocx, type AresDataObject } from '../../src/generator/index.js'
import { extractAresJson } from '../../src/ingest/extract.js'
import { toBlocks, norm, compareLessonSequencePackage } from '../../scripts/lib/docxDiff.js'
const root = '/oracle/data/outputs/v2'
const samples = [
  [
    'Physics/SS4.1_Greenhouse_Effect_and_Climate_Change',
    'Physics_Greenhouse_Effect_and_Climate_Change',
  ],
  ['Essential_Mathematics/SS1.2_Indices', 'Essential_Mathematics_Indices'],
  ['Maths/SS3.1_Trigonometry_I', 'Mathematics_Trigonometry_I'],
]
const summary = []
await mkdir('/audit-output/generated-docx', { recursive: true })
for (const [dir, prefix] of samples) {
  const base = path.join(root, dir)
  const raw = extractAresJson(
    await readFile(path.join(base, `${prefix}_data.json`), 'utf8'),
  ) as unknown as AresDataObject
  const generated = await generateBundleDocx(raw)
  const checks = []
  for (const [key, suffix] of [
    ['lessonSequence', 'CBE_LessonSequence'],
    ['finalExplanation', 'FinalExplanation'],
    ['teacherKey', 'FinalExplanation_TeacherKey'],
    ['summaryTable', 'SummaryTable'],
  ] as const) {
    const oracle = await readFile(path.join(base, `${prefix}_${suffix}.docx`))
    const bytes = generated[key]
    if (!bytes) throw new Error(`Sample lacks ${key}`)
    await writeFile(`/audit-output/generated-docx/${prefix}_${key}.docx`, bytes)
    const a = await toBlocks(bytes, false)
    const b = await toBlocks(oracle, false)
    const allowed = (s: string) =>
      norm(
        s
          .replaceAll('Related topic: not an exact match for this lesson.', '')
          .replaceAll('© 2026 SeaVuria and ARES.', '© 2026 SeaVuria and ARES Education.'),
      )
    const mismatches = []
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      if (allowed(a[i] ?? '') !== allowed(b[i] ?? '')) mismatches.push(i)
    checks.push({
      document: key,
      generatedBlocks: a.length,
      oracleBlocks: b.length,
      remainingMismatchBlocks: mismatches,
    })
    if (key === 'lessonSequence')
      checks.push({ packageStructure: await compareLessonSequencePackage(bytes, oracle, raw) })
  }
  summary.push({ sample: prefix, checks })
}
console.log(
  'AUDIT_DIAGNOSTIC_RESULT ' +
    JSON.stringify({
      oracleCommit: 'd3d2b875d5a2e6e6ad2409f900a4df06fd245c3e',
      normalizations: [
        'existing oracle-only Related topic note exclusion',
        'approved copyright ARES -> ARES Education',
      ],
      strictFidelityGateStillFailed: true,
      summary,
    }),
)
