/** Paired timing observations and lockout-message controls; restore the target afterwards. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
const output = process.env.LESSON3_AUDIT_RESULT_FILE
const base = process.env.E2E_BASE_URL
assert(file && output && base)
assert.equal(new URL(base).origin, 'http://app:3000')
const fixture = JSON.parse(await readFile(file, 'utf8')) as {
  run: string
  accounts: Record<string, { email: string }>
}
assert(fixture.run.startsWith('l3audit-'))
const rows: Array<{ label: string; status: number; ms: number; messages: string[] }> = []
async function wrong(email: string, label: string) {
  const start = performance.now()
  const response = await fetch(new URL('/api/users/login', base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-audit-password' }),
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json()) as { errors?: Array<{ message: string }> }
  const row = {
    label,
    status: response.status,
    ms: Math.round((performance.now() - start) * 100) / 100,
    messages: body.errors?.map((e) => e.message) ?? [],
  }
  assert.equal(row.status, 401)
  return row
}
for (let pair = 0; pair < 9; pair++) {
  const actor = ['teacher', 'teacherPeer', 'editorA'][pair % 3]
  const probes = [
    { email: fixture.accounts[actor].email, label: 'known-unlocked' },
    { email: `enum-absent-${pair}@invalid.example.test`, label: 'absent' },
  ]
  if (pair % 2) probes.reverse()
  for (const probe of probes) rows.push(await wrong(probe.email, probe.label))
}
const lockout = []
for (let attempt = 4; attempt <= 6; attempt++) {
  lockout.push(await wrong(fixture.accounts.teacher.email, `known-attempt-${attempt}`))
}
const absentControl = await wrong('enum-absent-control@invalid.example.test', 'absent-control')
const summaries = Object.fromEntries(
  ['known-unlocked', 'absent'].map((label) => {
    const values = rows
      .filter((r) => r.label === label)
      .map((r) => r.ms)
      .sort((a, b) => a - b)
    return [label, { n: values.length, minMs: values[0], medianMs: values[4], maxMs: values[8] }]
  }),
)
const result = {
  selection:
    'Three verified roles, three wrong passwords each; nine absent addresses; alternate pair order; sequential requests',
  summaries,
  rows,
  lockout,
  absentControl,
}
await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ summaries, lockout, absentControl }))
