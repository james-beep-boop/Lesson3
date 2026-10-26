/** Execute the supported production entry through the actual Payload CLI (including exit codes). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupRoleFixture, MARK, minimalResourceLinks, type RoleFixture } from '../helpers/fixtures'
let fx: RoleFixture
let root: string
const raw = () => ({
  schemaVersion: '1.0.0',
  META: {
    subject: fx.subject.name,
    grade: fx.subjectGrade.grade,
    substrand_id: '99.productionCLI',
    substrand_name: 'CLI',
    titleDoc: `${MARK}Production import`,
  },
  UNIT: null,
  LESSONS: [
    {
      number: 1,
      title: 'Lesson',
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
      resourceLinks: minimalResourceLinks(),
    },
  ],
  FINAL_EXPLANATION: null,
  SUMMARY_TABLE: null,
})
async function run(args: string[] = [], input = ''): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      ['node_modules/payload/bin.js', 'run', 'scripts/import-lessons.ts', '--', root, ...args],
      { env: { ...process.env, NODE_ENV: 'production' }, timeout: 30_000 },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
          stdout: stdout + stderr,
        })
      },
    )
    child.stdin?.end(input)
  })
}
beforeAll(async () => {
  fx = await setupRoleFixture()
  root = await mkdtemp(path.join(tmpdir(), 'lesson-import-'))
}, 60_000)
afterAll(async () => {
  await rm(root, { recursive: true, force: true })
  await fx?.teardown()
})
describe('supported CLI', () => {
  it('--yes imports once, repeats with exit 0 and never sends a message', async () => {
    await writeFile(path.join(root, 'lesson.json'), JSON.stringify(raw()))
    const messages = await fx.payload.count({ collection: 'messages' })
    const first = await run(['--yes'])
    expect(first, first.stdout).toMatchObject({ code: 0 })
    expect(first.stdout).toContain('Imported 1')
    const second = await run(['--yes'])
    expect(second, second.stdout).toMatchObject({ code: 0 })
    expect(second.stdout).toContain('Imported 0')
    expect(await fx.payload.count({ collection: 'messages' })).toEqual(messages)
  }, 60_000)
  it('returns exit 2 for rejected files and 3 for a malformed manifest', async () => {
    await writeFile(path.join(root, 'bad.json'), '{')
    expect((await run(['--yes'])).code).toBe(2)
    await writeFile(path.join(root, 'LESSONS.json'), '{')
    expect((await run(['--yes'])).code).toBe(3)
    await rm(path.join(root, 'LESSONS.json'))
    await rm(path.join(root, 'bad.json'))
  }, 60_000)
  it('returns exit 4 when an Official update is declined, without writing', async () => {
    const changed = raw()
    changed.LESSONS[0].slo.purpose = 'New release'
    await writeFile(path.join(root, 'lesson.json'), JSON.stringify(changed))
    const before = await fx.payload.count({ collection: 'lesson-bundle-versions' })
    // A closed input stream is a declined/unconfirmed run; EOF must never authorize it.
    const result = await run([], 'n\n')
    expect(result, result.stdout).toMatchObject({ code: 4 })
    expect(await fx.payload.count({ collection: 'lesson-bundle-versions' })).toEqual(before)
  }, 60_000)
})
