/**
 * One-off RBAC verification (run on the Rock via `payload run`).
 * Exercises the two highest-risk behaviors against the real DB, then deletes every
 * record it created (try/finally). Marker prefix keeps test data identifiable.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

const P = 'ZZ_RBAC_TEST_'
let pass = 0
let fail = 0
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`)
  ok ? pass++ : fail++
}

const run = async () => {
  const payload = await getPayload({ config })
  const created: { collection: 'users' | 'subjects' | 'subject-grades' | 'lesson-bundles'; id: number }[] = []
  const track = <T extends { id: number }>(collection: any, doc: T): T => {
    created.push({ collection, id: doc.id })
    return doc
  }

  try {
    const subject = track(
      'subjects',
      await payload.create({ collection: 'subjects', data: { name: `${P}Biology`, slug: `${P}bio` } }),
    )
    const sg = track(
      'subject-grades',
      await payload.create({ collection: 'subject-grades', data: { subject: subject.id, grade: 99 } }),
    )

    // displayName auto-generated
    check('subject-grade displayName computed', sg.displayName === `${P}Biology — Grade 99`)

    // M1: renaming the subject refreshes dependent SubjectGrade titles.
    await payload.update({ collection: 'subjects', id: subject.id, data: { name: `${P}Zoology` } })
    const sgRenamed = await payload.findByID({ collection: 'subject-grades', id: sg.id, depth: 0 })
    check(
      'subject rename refreshes SubjectGrade displayName',
      sgRenamed.displayName === `${P}Zoology — Grade 99`,
    )

    // --- auto-demote: <=1 subject admin per subject-grade ---
    const userA = track(
      'users',
      await payload.create({
        collection: 'users',
        data: {
          name: `${P}A`,
          email: `${P.toLowerCase()}a@test.local`,
          password: 'test1234',
          assignments: [{ subjectGrade: sg.id, role: 'subjectAdmin' }],
        },
      }),
    )
    const userB = track(
      'users',
      await payload.create({
        collection: 'users',
        data: {
          name: `${P}B`,
          email: `${P.toLowerCase()}b@test.local`,
          password: 'test1234',
          assignments: [{ subjectGrade: sg.id, role: 'subjectAdmin' }],
        },
      }),
    )
    const aAfter = await payload.findByID({ collection: 'users', id: userA.id, depth: 0 })
    const aRole = (aAfter.assignments ?? []).find((x: any) => {
      const id = typeof x.subjectGrade === 'object' ? x.subjectGrade.id : x.subjectGrade
      return id === sg.id
    })?.role
    check('prior subject-admin (A) auto-demoted to editor when B promoted', aRole === 'editor')
    const bAfter = await payload.findByID({ collection: 'users', id: userB.id, depth: 0 })
    const bRole = (bAfter.assignments ?? []).find((x: any) => {
      const id = typeof x.subjectGrade === 'object' ? x.subjectGrade.id : x.subjectGrade
      return id === sg.id
    })?.role
    check('newly promoted (B) remains subjectAdmin', bRole === 'subjectAdmin')

    // --- field-level access: an Editor edits prose but not structure (phase/meta) ---
    const editor = track(
      'users',
      await payload.create({
        collection: 'users',
        data: {
          name: `${P}E`,
          email: `${P.toLowerCase()}e@test.local`,
          password: 'test1234',
          assignments: [{ subjectGrade: sg.id, role: 'editor' }],
        },
      }),
    )
    const editorUser = await payload.findByID({ collection: 'users', id: editor.id })

    const bundle = track(
      'lesson-bundles',
      await payload.create({
        collection: 'lesson-bundles',
        data: {
          title: `${P}Bundle`,
          subjectGrade: sg.id,
          meta: { subject: 'Biology', titleDoc: 'ORIGINAL TITLE' },
          lessons: [
            {
              title: 'L1',
              framework: [{ phase: 'Predict Phase', learnerExperience: 'orig' }],
            },
          ],
        },
      }),
    )
    check('lesson number derived from order', bundle.lessons?.[0]?.number === 1)

    // Editor updates: prose change should stick; meta (structure) + phase should be ignored.
    const updated = await payload.update({
      collection: 'lesson-bundles',
      id: bundle.id,
      user: editorUser,
      overrideAccess: false,
      data: {
        meta: { subject: 'Biology', titleDoc: 'EDITOR HACKED TITLE' },
        lessons: [
          {
            id: bundle.lessons![0].id,
            title: 'L1',
            framework: [
              {
                id: bundle.lessons![0].framework![0].id,
                phase: 'Observe Phase', // structure — should be rejected/ignored
                learnerExperience: 'EDITED BY EDITOR', // prose — should stick
              },
            ],
          },
        ],
      },
    })
    check(
      'editor prose edit applied',
      updated.lessons?.[0]?.framework?.[0]?.learnerExperience === 'EDITED BY EDITOR',
    )
    check(
      'editor META edit ignored (structure protected)',
      updated.meta?.titleDoc === 'ORIGINAL TITLE',
    )
    check(
      'editor phase edit ignored (structure protected)',
      updated.lessons?.[0]?.framework?.[0]?.phase === 'Predict Phase',
    )

    // Editor adding a lesson (structural) should be rejected by the integrity hook.
    let blocked = false
    try {
      await payload.update({
        collection: 'lesson-bundles',
        id: bundle.id,
        user: editorUser,
        overrideAccess: false,
        data: {
          lessons: [
            { id: bundle.lessons![0].id, title: 'L1' },
            { title: 'L2 injected by editor' },
          ],
        },
      })
    } catch {
      blocked = true
    }
    check('editor adding a lesson rejected (cardinality protected)', blocked)
  } finally {
    // Cleanup in reverse creation order.
    for (const { collection, id } of created.reverse()) {
      try {
        await payload.delete({ collection, id })
      } catch (e) {
        console.log(`cleanup warn: ${collection}#${id}: ${(e as Error).message}`)
      }
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

await run()
