/** Mounted unchanged into each migration image; imports that image's source and test helpers. */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../../src/payload.config'
import { createUserVerified, setupRoleFixture } from '../helpers/fixtures'
import { createTopicAs, testSubmissionKey } from '../helpers/discussions'
import { projectCapture } from '../../src/lib/editRecovery/projection'
import { CAPTURE_SCHEMA_VERSION } from '../../src/lib/editRecovery/provenance'
import { bundleToAresData } from '../../src/generator/adapter'
import { ingestUploadItems } from '../../src/ingest'
import { relId } from '../../src/lib/relId'
const payload = await getPayload({ config })
const file = '/audit-output/upgrade-state.json'
type State = {
  plan: number
  version: number
  uid: string
  users: Record<'teacher' | 'editor' | 'siteAdmin', { id: number; email: string }>
  password: string
  topic: number
  capture: number
  candidate?: number
  oldToken?: string
}
try {
  if (process.argv.includes('--seed')) {
    if ((await payload.count({ collection: 'users', overrideAccess: true })).totalDocs === 0)
      await createUserVerified(payload, {
        name: 'Audit upgrade bootstrap',
        email: 'audit-upgrade-owner@lesson3.local',
        password: 'audit-bootstrap-for-disposable-upgrade',
        roles: ['siteAdmin'],
      })
    const fx = await setupRoleFixture()
    assert.ok(
      !fx.users.teacher.roles?.includes('siteAdmin'),
      'Plain Teacher fixture must not be the bootstrap administrator',
    )
    const data = bundleToAresData(fx.version)
    data.META = {
      ...(data.META as Record<string, unknown>),
      subject: fx.subject.name,
      substrand_id: '98.2',
      titleDoc: 'Audit previous-release imported source',
    }
    data.UNIT = { ...(data.UNIT ?? {}), content: 'Audit ARES overview before upgrade' }
    const items = [
      {
        name: 'audit-upgrade.json',
        extract: () => ({
          schemaVersion: '1.0.0',
          ...data,
          FINAL_EXPLANATION: data.FINAL_EXPLANATION ?? null,
          SUMMARY_TABLE: data.SUMMARY_TABLE ?? null,
        }),
      },
    ]
    let imported = await ingestUploadItems(payload, items)
    if (imported.needsConfirmation)
      imported = await ingestUploadItems(payload, items, undefined, imported.previewToken)
    console.log(
      JSON.stringify({
        phase: 'previous-release fixture import',
        count: imported.bundles.length,
        rejected: imported.rejected,
      }),
    )
    assert.equal(imported.bundles.length, 1)
    const importedPlanId = imported.bundles[0].id
    const currentPlan = await payload.findByID({
      collection: 'lesson-plans',
      id: importedPlanId,
      depth: 0,
      overrideAccess: true,
    })
    const source = await payload.findByID({
      collection: 'lesson-bundle-versions',
      id: relId(currentPlan.officialVersion)!,
      depth: 0,
      overrideAccess: true,
    })
    assert.ok(
      source.releaseFingerprint,
      'Seed a real imported ARES release, not just a hand-made version',
    )

    await payload.updateGlobal({
      slug: 'system-settings',
      data: { schoolName: 'Audit school before upgrade', features: { forumEnabled: true } },
      overrideAccess: true,
    })
    await payload.updateGlobal({ slug: 'payload-jobs-stats', data: {}, overrideAccess: true })
    await payload.create({
      collection: 'favorites',
      data: { user: fx.users.teacher.id, version: source.id },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'messages',
      data: {
        sender: fx.users.subjectAdmin.id,
        recipient: fx.users.teacher.id,
        body: 'Audit upgrade private message',
      },
      overrideAccess: true,
    })
    const topic = await createTopicAs(payload, fx.users.teacher, {
      title: 'Audit upgrade discussion',
      body: 'Audit upgrade opening post',
    })
    await payload.create({
      collection: 'discussion-replies',
      data: {
        topic: topic.id,
        body: 'Audit upgrade reply',
        submissionKey: testSubmissionKey(),
        joinedAtSeq: 0,
      } as never,
      overrideAccess: false,
      user: fx.users.editor,
    })
    const edit = structuredClone(source)
    edit.lessons![0].overview = 'Audit upgrade captured prose'
    const capture = await payload.create({
      collection: 'edit-recovery',
      data: {
        user: fx.users.editor.id,
        sourceVersion: source.id,
        lessonPlan: importedPlanId,
        generation: 1,
        revision: 1,
        baseUpdatedAt: source.updatedAt,
        schemaVersion: CAPTURE_SCHEMA_VERSION,
        content: projectCapture(edit as unknown as Record<string, unknown>),
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'payload-kv',
      data: { key: 'audit-upgrade-key', data: { message: 'Audit upgrade KV' } },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: 'lesson-bundle-versions', value: source.id },
        user: { relationTo: 'users', value: fx.users.editor.id },
      },
      overrideAccess: true,
    })
    await payload.create({
      collection: 'payload-preferences',
      data: {
        key: 'audit-upgrade-preference',
        value: { message: 'Audit upgrade preference' },
      } as never,
      user: { id: fx.users.editor.id, collection: 'users' } as never,
      overrideAccess: true,
    })
    await payload.jobs.queue({
      task: 'expireEditRecovery',
      input: {},
      queue: 'audit-upgrade-held',
      waitUntil: new Date('2099-01-01T00:00:00Z'),
    })
    const counts = []
    for (const slug of Object.keys(payload.collections)) {
      const count = (await payload.count({ collection: slug as never, overrideAccess: true }))
        .totalDocs
      counts.push({ collection: slug, count })
      assert.ok(count > 0, `Previous release must contain representative rows in ${slug}`)
    }
    const sourceUid = source.uid
    assert.ok(
      typeof sourceUid === 'string' && sourceUid.length > 0,
      'Imported snapshot has its own uid',
    )
    const state: State = {
      plan: importedPlanId,
      version: source.id,
      uid: sourceUid,
      users: Object.fromEntries(
        ['teacher', 'editor', 'siteAdmin'].map((k) => [
          k,
          { id: fx.users[k as 'teacher'].id, email: fx.users[k as 'teacher'].email },
        ]),
      ) as State['users'],
      password: fx.password,
      topic: topic.id,
      capture: capture.id,
    }
    await writeFile(file, JSON.stringify(state), { mode: 0o600 })
    console.log(
      JSON.stringify({
        phase: 'seed previous release',
        collections: counts,
        globalsSeeded: ['system-settings', 'payload-jobs-stats'],
      }),
    )
  } else {
    const state = JSON.parse(await readFile(file, 'utf8')) as State
    const base = process.env.E2E_BASE_URL ?? 'http://app:3000'
    const login = async (role: keyof State['users']) => {
      const response = await fetch(`${base}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: state.users[role].email, password: state.password }),
      })
      assert.equal(response.status, 200)
      const body = (await response.json()) as { token: string }
      assert.ok(body.token)
      return body.token
    }
    const teacher = await login('teacher')
    const editing = await login('editor')
    const read = async (path: string, token = teacher) => {
      const response = await fetch(base + path, { headers: { Authorization: `JWT ${token}` } })
      assert.equal(response.status, 200, path)
      return response.json() as Promise<Record<string, unknown>>
    }
    const official = await read(`/api/lesson-bundle-versions/${state.version}?depth=0`)
    assert.equal(official.uid, state.uid)
    const plan = await read(`/api/lesson-plans/${state.plan}?depth=0`)
    assert.equal(relId(plan.officialVersion), state.version)
    assert.ok(JSON.stringify(await read('/api/favorites')).includes(`"version":`))
    assert.ok(JSON.stringify(await read('/api/messages')).includes('Audit upgrade private message'))
    assert.ok(
      JSON.stringify(await read(`/api/discussion-topics/${state.topic}`)).includes(
        'Audit upgrade opening post',
      ),
    )
    assert.ok(
      JSON.stringify(
        await read(`/api/lesson-bundle-versions/${state.version}/recovery`, editing),
      ).includes('Audit upgrade captured prose'),
    )
    if (process.argv.includes('--old-check')) {
      const data = structuredClone(official) as { lessons: { overview: string }[] }
      data.lessons[0].overview = 'Audit previous-release saved candidate'
      const form = new FormData()
      form.set('data', JSON.stringify(data))
      const response = await fetch(
        `${base}/api/lesson-bundle-versions/${state.version}/save-as-new`,
        { method: 'POST', headers: { Authorization: `JWT ${editing}` }, body: form },
      )
      assert.equal(response.status, 200)
      state.candidate = ((await response.json()) as { id: number }).id
      state.oldToken = teacher
      await writeFile(file, JSON.stringify(state), { mode: 0o600 })
      console.log(
        JSON.stringify({
          phase: 'previous release native smoke',
          checks: [
            'ordinary sign-in',
            'Official uid/pointer',
            'favorite',
            'private message',
            'discussion',
            'recoverable captured prose',
            'save-as-new candidate',
          ],
          passed: 7,
        }),
      )
    } else {
      assert.ok(state.oldToken && state.candidate)
      const old = await read('/api/users/me', state.oldToken)
      assert.equal(
        (old.user as { id: number })?.id,
        state.users.teacher.id,
        'Existing session survives same-secret app upgrade',
      )
      const candidate = await read(`/api/lesson-bundle-versions/${state.candidate}?depth=0`)
      assert.ok(JSON.stringify(candidate).includes('Audit previous-release saved candidate'))
      assert.equal(
        (await payload.findGlobal({ slug: 'system-settings', overrideAccess: true })).schoolName,
        'Audit school before upgrade',
      )
      const preference = await payload.find({
        collection: 'payload-preferences',
        where: { key: { equals: 'audit-upgrade-preference' } },
        overrideAccess: true,
      })
      assert.equal(preference.totalDocs, 1)
      const kv = await payload.find({
        collection: 'payload-kv',
        where: { key: { equals: 'audit-upgrade-key' } },
        overrideAccess: true,
      })
      assert.equal(kv.totalDocs, 1)
      const prepare = await fetch(
        `${base}/api/lesson-bundle-versions/${state.version}/export?as=docx`,
        { method: 'POST', headers: { Authorization: `JWT ${teacher}` } },
      )
      assert.ok([200, 202].includes(prepare.status))
      // The upgrade fixture pauses cron for a quiescent migration snapshot. Run only its default queue explicitly.
      const operator = await login('siteAdmin')
      const run = await fetch(`${base}/api/payload-jobs/run?limit=20`, {
        headers: { Authorization: `JWT ${operator}` },
      })
      assert.equal(
        run.status,
        200,
        'Run export jobs in the app instance that owns the artifact cache',
      )
      const document = await fetch(
        `${base}/api/lesson-bundle-versions/${state.version}/export/doc?doc=lessonSequence&as=docx`,
        { headers: { Authorization: `JWT ${teacher}` } },
      )
      assert.equal(document.status, 200)
      assert.equal(
        Buffer.from(await document.arrayBuffer())
          .subarray(0, 2)
          .toString(),
        'PK',
      )
      console.log(
        JSON.stringify({
          phase: 'audit-base native smoke',
          checks: [
            'ordinary sign-in',
            'Official uid/pointer',
            'favorite',
            'private message',
            'discussion',
            'recoverable captured prose',
            'retained existing session',
            'retained saved candidate',
            'school name',
            'preference',
            'KV',
            'Word export',
          ],
          passed: 12,
        }),
      )
    }
  }
} finally {
  await payload.destroy()
}
process.exit(0)
