import { afterAll, beforeAll, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { setupRoleFixture, type RoleFixture } from '../helpers/fixtures'
import { setSchoolName } from '../../src/lib/setSchoolName'
let fx: RoleFixture
let original: string
beforeAll(async () => {
  fx = await setupRoleFixture()
  original =
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).schoolName ??
    ''
})
afterAll(async () => {
  if (fx) await setSchoolName(fx.payload, original)
  await fx?.teardown()
})
function run(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['node_modules/payload/bin.js', 'run', 'scripts/set-school-name.ts', '--', ...args],
      { env: { ...process.env, NODE_ENV: 'production' }, timeout: 30_000 },
      (error) => resolve(error ? (typeof error.code === 'number' ? error.code : 1) : 0),
    )
  })
}
it('the actual operator command sets and clears the name, preserves flags, and returns nonzero on invalid input', async () => {
  const before = await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })
  expect(await run(['  Kenya Lessons · all schools  '])).toBe(0)
  const after = await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })
  expect(after.schoolName).toBe('Kenya Lessons · all schools')
  expect(after.features).toEqual(before.features)
  expect(after.flagChanges).toEqual(before.flagChanges)
  expect(await run(['Bad\nName'])).toBe(1)
  expect(await run([])).toBe(1)
  expect(await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).toEqual(
    after,
  )
  expect(await run([''])).toBe(0)
  expect(
    (await fx.payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).schoolName,
  ).toBe('')
}, 120_000)
