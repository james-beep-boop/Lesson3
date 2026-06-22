/**
 * GATE (DB-less) for the contract drift validator (src/ingest/contract.ts).
 *
 * The validator is hand-rolled (no ajv), so this proves it against crafted fixtures: a fully
 * CONFORMING bundle reports zero drift, intentional-empty sections (null) are allowed, and each
 * drift class we care about (alias key, corrupted `safetyNotes`, bad enum, wrong type, missing
 * required, missing schemaVersion) is detected with an actionable message.
 *
 * Run:  cd app && npx tsx scripts/contract-check.ts
 */
import { contractDrift } from '../src/ingest/contract'

let passed = 0
let failed = 0
const check = (label: string, cond: boolean) => {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`)
  if (cond) passed++
  else failed++
}
const has = (msgs: string[], needle: string) => msgs.some((m) => m.includes(needle))

// A minimal but fully CONFORMING raw ARES object (canonical names, all required fields).
const conforming = () => ({
  schemaVersion: '1.0.0',
  META: {
    subject: 'Biology',
    grade: 10,
    substrand_id: '2.2',
    substrand_name: 'Transport in Plants',
    titleDoc: 'BIOLOGY GRADE 10: TRANSPORT IN PLANTS',
  },
  UNIT: {
    gradeLevel: 'Grade 10',
    subject: 'Biology',
    strand: 'Strand 2.0',
    substrand: 'Sub-Strand 2.2',
    totalDuration: '8 lessons × 40 minutes',
    content: '- a\n- b',
    learningOutcomes: 'a) x',
    coreCompetencies: '- Critical thinking',
  },
  LESSONS: [
    {
      number: 1,
      title: 'Lesson one',
      duration: '40 minutes',
      slo: {
        purpose: 'p',
        knowledge: 'k',
        skills: 's',
        attitudes: 'a',
        keyInquiry: 'q',
      },
      framework: [
        {
          phase: 'Predict Phase',
          learnerExperience: 'l',
          teacherMoves: 't',
          sensemakingStrategy: 's',
          formativeAssessment: 'f',
        },
      ],
    },
  ],
  FINAL_EXPLANATION: {
    subjectLabel: 'BIOLOGY',
    instructions: 'do it',
    sections: [{ title: 's1', prompt: 'p1' }],
  },
  SUMMARY_TABLE: {
    subStrand: 'Transport in Plants',
    drivingQuestion: 'why?',
    lessons: [{ number: 1, title: 't', observed: 'o', learned: 'l', explained: 'e' }],
  },
})

console.log('Contract validator gate')

check('a fully conforming bundle reports zero drift', contractDrift(conforming()).length === 0)

// Intentional-empty sections (null) are allowed (the agreed "omitted by design" signal).
const nulled = { ...conforming(), FINAL_EXPLANATION: null, SUMMARY_TABLE: null }
check('null FINAL_EXPLANATION / SUMMARY_TABLE conform (intentional-empty)', contractDrift(nulled).length === 0)

// Alias key + the resulting missing canonical field.
const aliased = conforming()
delete (aliased.UNIT as Record<string, unknown>).totalDuration
;(aliased.UNIT as Record<string, unknown>).duration = '8 lessons'
{
  const d = contractDrift(aliased)
  check('UNIT.duration flagged as alias of totalDuration', has(d, 'UNIT.duration: unexpected key (non-canonical alias of "totalDuration")'))
  check('missing canonical UNIT.totalDuration reported', has(d, 'UNIT.totalDuration: required field missing'))
}

// Legacy 'storyline' is now the alias; 'storylineThread' is canonical (ARES SCHEMA.md 2026-06-18).
const legacyStoryline = conforming()
;(legacyStoryline.UNIT as Record<string, unknown>).storyline = 'L1: …'
check('UNIT.storyline flagged as alias of storylineThread', has(contractDrift(legacyStoryline), 'UNIT.storyline: unexpected key (non-canonical alias of "storylineThread")'))

// Corrupted safetyNotes typo.
const typo = conforming()
;(typo.LESSONS[0]!.slo as Record<string, unknown>).safety3otes = 'none'
check('slo.safety3otes flagged as a corrupted safetyNotes', has(contractDrift(typo), 'safety3otes: unexpected key (likely a corrupted "safetyNotes")'))

// Bad phase enum value.
const badPhase = conforming()
;(badPhase.LESSONS[0]!.framework[0] as Record<string, unknown>).phase = 'Warmup Phase'
check('unknown framework phase rejected by enum', has(contractDrift(badPhase), 'not in allowed'))

// Wrong type for META.grade.
const badType = conforming()
;(badType.META as Record<string, unknown>).grade = '10'
check('META.grade as string flagged (expected integer)', has(contractDrift(badType), 'META.grade: expected integer, got string'))

// Missing top-level schemaVersion.
const noVersion = conforming() as Record<string, unknown>
delete noVersion.schemaVersion
check('missing schemaVersion reported', has(contractDrift(noVersion), 'schemaVersion: required field missing'))

// Empty UNIT object (bio_1_4 case) → missing-required, NOT silently accepted.
const emptyUnit = { ...conforming(), UNIT: {} }
check('empty UNIT object reports missing required fields', contractDrift(emptyUnit).length >= 8)

// String LESSONS[].number (the live chem_1_4 drift) → integer mismatch. This is the exact
// class the ingest hard gate now rejects (ingestItems pre-flight throws on any non-empty drift).
const stringNumber = conforming()
;(stringNumber.LESSONS[0]! as Record<string, unknown>).number = '1'
check('LESSONS[].number as string flagged (expected integer)', has(contractDrift(stringNumber), 'LESSONS[0].number: expected integer, got string'))

console.log(`\n${'='.repeat(50)}`)
console.log(`CONTRACT GATE: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('✓ CONTRACT CHECK PASSED')
