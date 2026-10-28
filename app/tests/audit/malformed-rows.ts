import assert from 'node:assert/strict'
import { setupRoleFixture } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'
const fx = await setupRoleFixture()
try {
  const snapshot = async () =>
    JSON.stringify(
      (
        await fx.payload.find({
          collection: 'lesson-bundle-versions',
          where: { lessonPlan: { equals: fx.plan.id } },
          overrideAccess: true,
          depth: 0,
          sort: 'id',
          pagination: false,
        })
      ).docs,
    )
  const before = await snapshot()
  const token = await login(fx.users.editor.email, fx.password)
  const cases: [string, (data: Record<string, unknown>) => void][] = [
    [
      'lessons',
      (data) => {
        data.lessons = [null]
      },
    ],
    [
      'framework',
      (data) => {
        ;(data.lessons as Record<string, unknown>[])[0].framework = [null]
      },
    ],
    [
      'sections',
      (data) => {
        ;(data.finalExplanation as Record<string, unknown>).sections = [null]
      },
    ],
    [
      'rubric',
      (data) => {
        ;(data.finalExplanation as Record<string, unknown>).rubric = [null]
      },
    ],
    [
      'summary lessons',
      (data) => {
        ;(data.summaryTable as Record<string, unknown>).lessons = [null]
      },
    ],
  ]
  const results = []
  for (const [field, mutate] of cases) {
    const data = structuredClone(fx.version) as unknown as Record<string, unknown>
    mutate(data)
    const form = new FormData()
    form.set('data', JSON.stringify(data))
    const response = await fetch(url(`/api/lesson-bundle-versions/${fx.version.id}/save-as-new`), {
      method: 'POST',
      headers: { Authorization: `JWT ${token}` },
      body: form,
    })
    results.push({ field, status: response.status })
    await response.arrayBuffer()
    assert.equal(await snapshot(), before, 'Malformed input must not create or alter version rows')
  }
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      actor: 'teacher with editing access',
      results,
      versionRowsUnchanged: true,
    }),
  )
  assert.ok(
    results.every((x) => x.status >= 400 && x.status < 500),
    'Malformed rows should produce a controlled client refusal',
  )
} finally {
  await fx.teardown()
}
process.exit(0)
