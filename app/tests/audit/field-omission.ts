import assert from 'node:assert/strict'
import { setupRoleFixture, minimalBundleContent } from '../helpers/fixtures'
import { login, url } from '../helpers/httpWire'
const fx = await setupRoleFixture()
try {
  const content = minimalBundleContent()
  const source = await fx.payload.create({
    collection: 'lesson-bundle-versions',
    data: {
      ...content,
      lessonPlan: fx.plan.id,
      subjectGrade: fx.subjectGrade.id,
      semver: '1.1.0',
      title: 'Audit protected fields',
      meta: { ...content.meta, outputDir: 'original-output' },
      unit: { content: 'Administrator authored overview' },
      lessons: content.lessons.map((l) => ({
        ...l,
        substrand: 'original-identity',
        aresKeywords: 'original-keywords',
      })),
    } as never,
    overrideAccess: true,
    depth: 0,
  })
  const results = []
  for (const actor of ['editor', 'subjectAdmin'] as const) {
    const actorLabel = actor === 'editor' ? 'teacher with editing access' : 'subject administrator'
    const data = structuredClone(source)
    data.lessons![0].overview = `Audit prose by ${actorLabel}`
    if (actor === 'editor') delete data.unit
    else {
      data.meta!.outputDir = 'changed-output'
      data.lessons![0].substrand = 'changed-identity'
      data.lessons![0].aresKeywords = 'changed-keywords'
    }
    const form = new FormData()
    form.set('data', JSON.stringify(data))
    const token = await login(fx.users[actor].email, fx.password)
    const res = await fetch(url(`/api/lesson-bundle-versions/${source.id}/save-as-new`), {
      method: 'POST',
      headers: { Authorization: `JWT ${token}` },
      body: form,
    })
    assert.equal(res.status, 200, `Save request status for ${actorLabel}`)
    const body = (await res.json()) as { id: number }
    const saved = await fx.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: body.id,
      overrideAccess: true,
      depth: 0,
    })
    const observations = {
      actor: actor === 'editor' ? 'teacher with editing access' : 'subject administrator',
      status: res.status,
      unitPreserved: saved.unit?.content === source.unit?.content,
      outputDirPreserved: saved.meta?.outputDir === source.meta?.outputDir,
      substrandPreserved: saved.lessons?.[0].substrand === source.lessons?.[0].substrand,
      keywordsPreserved: saved.lessons?.[0].aresKeywords === source.lessons?.[0].aresKeywords,
    }
    results.push(observations)
  }
  const unchanged = await fx.payload.findByID({
    collection: 'lesson-bundle-versions',
    id: source.id,
    overrideAccess: true,
    depth: 0,
  })
  assert.deepEqual(unchanged, source, 'Source snapshot must remain immutable')
  console.log(
    JSON.stringify({
      source: '6e75a173e822e4c4be42821b0a4af48ca457bd36',
      sourceUnchanged: true,
      results,
    }),
  )
  assert.ok(
    results[0].unitPreserved,
    'Omitting administrator-only UNIT must preserve the source overview',
  )
  assert.ok(
    results[1].outputDirPreserved && results[1].substrandPreserved && results[1].keywordsPreserved,
    'Never-editable ARES identity fields must remain unchanged',
  )
} finally {
  await fx.teardown()
}
process.exit(0)
