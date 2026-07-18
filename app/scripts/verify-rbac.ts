/**
 * RBAC verification (run on the Rock via `payload run`) for the cross-cutting People/Curriculum
 * rules that are NOT tied to lesson content: SubjectGrade displayName derivation, the ≤1-subject-
 * admin auto-demote, and the password/assignment guards (SPEC §8). Exercises them against the real
 * DB, then deletes every record it created (try/finally). Marker prefix keeps test data identifiable.
 *
 * The lesson-content field-level RBAC (Editor prose vs admin structure/answer-keys, read scoping) and
 * the version-immutability / save-as-new / make-official rules are now covered by the automated suites
 * (`tests/int/access.int.spec.ts` + `tests/http/endpoints.http.spec.ts`). The former manual companion
 * `verify-stage2b-edit.ts` was RETIRED 2026-07-18 — it modelled the superseded MUTABLE working-copy
 * flow (direct create + in-place update), which the immutable save-as-new model and the create-deny
 * both now reject.
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
  const created: { collection: 'users' | 'subjects' | 'subject-grades'; id: number }[] = []
  const track = <T extends { id: number }>(collection: any, doc: T): T => {
    created.push({ collection, id: doc.id })
    return doc
  }

  try {
    const subject = track(
      'subjects',
      await payload.create({ collection: 'subjects', data: { name: `${P}Biology` } }),
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
          // auth.verify (2026-07-09): born verified, and never email a .test.local address —
          // a relay bounce on an SMTP-configured stack would fail the create itself.
          _verified: true,
        },
        disableVerificationEmail: true,
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
          _verified: true,
        },
        disableVerificationEmail: true,
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

    const userBUser = await payload.findByID({ collection: 'users', id: userB.id })

    // An Editor scoped to the same subject-grade — the subject of the password/assignment guards.
    const editor = track(
      'users',
      await payload.create({
        collection: 'users',
        data: {
          name: `${P}E`,
          email: `${P.toLowerCase()}e@test.local`,
          password: 'test1234',
          assignments: [{ subjectGrade: sg.id, role: 'editor' }],
          _verified: true,
        },
        disableVerificationEmail: true,
      }),
    )
    const editorUser = await payload.findByID({ collection: 'users', id: editor.id })

    // --- password guard (SPEC §8): only self or site admin may change a password ---
    let saPasswordBlocked = false
    try {
      await payload.update({
        collection: 'users',
        id: editor.id,
        user: userBUser, // a Subject Admin
        overrideAccess: false,
        data: { password: 'hacked-by-subject-admin' },
      })
    } catch {
      saPasswordBlocked = true
    }
    check('subject admin cannot change another user password', saPasswordBlocked)

    let selfPasswordOk = true
    try {
      await payload.update({
        collection: 'users',
        id: editor.id,
        user: editorUser, // self
        overrideAccess: false,
        data: { password: 'editors-own-new-password' },
      })
    } catch {
      selfPasswordOk = false
    }
    check('user can change their own password', selfPasswordOk)

    // The guard must not over-restrict: a Subject Admin can still manage assignments in their SG.
    let saAssignmentOk = true
    try {
      await payload.update({
        collection: 'users',
        id: editor.id,
        user: userBUser,
        overrideAccess: false,
        data: { assignments: [{ subjectGrade: sg.id, role: 'editor' }] },
      })
    } catch {
      saAssignmentOk = false
    }
    check('subject admin can still manage assignments in their SG', saAssignmentOk)
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
