/**
 * Fixture resolution shared by the two fidelity gates (`fidelity-spike.ts`, `adapter-fidelity.ts`).
 *
 * The gates compare Lesson3's output with the DOCX that upstream committed beside a sub-strand's JSON. Pick the
 * sub-strand by pointing at ITS UPSTREAM OUTPUT DIRECTORY — the filenames are derived, so no file has to be
 * renamed to look like another sub-strand and the log names what actually ran:
 *
 *   ARES_FIDELITY_SUBSTRAND_DIR=<clone>/data/outputs/v2/Maths/SS3.1_Trigonometry_I npx tsx scripts/fidelity-spike.ts
 *
 * ⚑ The clone must be checked out at the SHA recorded in `src/generator/vendor/PROVENANCE.md`: upstream
 * regenerates lesson prose continually, so the JSON and the DOCX oracle must come from the same commit.
 *
 * Choose a sub-strand that exercises what changed. Physics 4.1 has no table in a framework column, so a re-pin
 * touching table rendering needs Essential Mathematics Indices or Mathematics Trigonometry I as well.
 *
 * Backwards compatible: with `ARES_FIDELITY_JSON` + `ARES_FIDELITY_ORACLE_DIR` (the original pair) or nothing
 * set, the Physics 4.1 fixture is used exactly as before.
 */
import { readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PHYSICS_PREFIX = 'Physics_Greenhouse_Effect_and_Climate_Change'

export interface FidelityFixture {
  /** Human label for the log, e.g. `Mathematics_Trigonometry_I`. */
  label: string
  jsonPath: string
  oracleDir: string
  approved: {
    lessonSequence: string
    finalExplanation: string
    teacherKey: string
    summaryTable: string
  }
}

const filesFor = (prefix: string) => ({
  lessonSequence: `${prefix}_CBE_LessonSequence.docx`,
  finalExplanation: `${prefix}_FinalExplanation.docx`,
  teacherKey: `${prefix}_FinalExplanation_TeacherKey.docx`,
  summaryTable: `${prefix}_SummaryTable.docx`,
})

export function resolveFidelityFixture(env: NodeJS.ProcessEnv = process.env): FidelityFixture {
  const dir = env.ARES_FIDELITY_SUBSTRAND_DIR
  if (dir) {
    const dataFiles = readdirSync(dir).filter((name) => name.endsWith('_data.json'))
    if (dataFiles.length !== 1) {
      throw new Error(
        `ARES_FIDELITY_SUBSTRAND_DIR=${dir} must hold exactly one *_data.json; found ${dataFiles.length}`,
      )
    }
    const prefix = dataFiles[0]!.slice(0, -'_data.json'.length)
    return {
      label: prefix,
      jsonPath: path.join(dir, dataFiles[0]!),
      oracleDir: dir,
      approved: filesFor(prefix),
    }
  }
  return {
    label: PHYSICS_PREFIX,
    jsonPath:
      env.ARES_FIDELITY_JSON ??
      path.join(
        os.homedir(),
        'Desktop',
        'ares-json',
        'physics__grade_10__ss_4_1__greenhouse_effect_and_climate_change.json',
      ),
    oracleDir:
      env.ARES_FIDELITY_ORACLE_DIR ??
      path.join(
        os.homedir(),
        'Documents',
        'GitHub',
        'cbe-generation-system',
        'data',
        'outputs',
        'v2',
        'Physics',
        'SS4.1_Greenhouse_Effect_and_Climate_Change',
      ),
    approved: filesFor(PHYSICS_PREFIX),
  }
}
