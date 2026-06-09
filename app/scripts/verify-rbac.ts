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
              duration: '40 minutes',
              substrand: 'orig substrand',
              aresKeywords: 'kw1, kw2',
              framework: [{ phase: 'Predict Phase', learnerExperience: 'orig' }],
            },
          ],
          finalExplanation: {
            subjectLabel: 'orig label',
            sections: [{ title: 'S1', prompt: 'orig prompt', exemplar: 'orig exemplar' }],
          },
          summaryTable: {
            subStrand: 'orig st-substrand',
            drivingQuestion: 'orig dq',
            lessons: [{ title: 'STL', observed: 'orig observed' }],
          },
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
    // Admin-only array subfields must survive an editor edit (not be wiped to null).
    check(
      'editor edit preserves admin-only duration (not wiped)',
      updated.lessons?.[0]?.duration === '40 minutes',
    )
    check(
      'editor edit preserves admin-only aresKeywords (not wiped)',
      updated.lessons?.[0]?.aresKeywords === 'kw1, kw2',
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

    // --- exemplar is an answer key → Subject Admin only (SPEC §5) ---
    const userBUser = await payload.findByID({ collection: 'users', id: userB.id })
    const sectionId = bundle.finalExplanation?.sections?.[0]?.id
    const editorSectionEdit = await payload.update({
      collection: 'lesson-bundles',
      id: bundle.id,
      user: editorUser,
      overrideAccess: false,
      data: {
        // Mirror the admin UI, which submits the whole document (required `phase` present).
        lessons: [
          {
            id: bundle.lessons![0].id,
            title: 'L1',
            framework: [
              {
                id: bundle.lessons![0].framework![0].id,
                phase: 'Predict Phase',
                learnerExperience: 'orig',
              },
            ],
          },
        ],
        finalExplanation: {
          sections: [
            { id: sectionId, title: 'S1', prompt: 'editor prompt', exemplar: 'EDITOR HACK' },
          ],
        },
      },
    })
    check(
      'editor can edit section prompt (prose)',
      editorSectionEdit.finalExplanation?.sections?.[0]?.prompt === 'editor prompt',
    )
    check(
      'editor cannot edit exemplar (answer key protected)',
      editorSectionEdit.finalExplanation?.sections?.[0]?.exemplar === 'orig exemplar',
    )
    const adminSectionEdit = await payload.update({
      collection: 'lesson-bundles',
      id: bundle.id,
      user: userBUser,
      overrideAccess: false,
      data: {
        lessons: [
          {
            id: bundle.lessons![0].id,
            title: 'L1',
            framework: [
              {
                id: bundle.lessons![0].framework![0].id,
                phase: 'Predict Phase',
                learnerExperience: 'orig',
              },
            ],
          },
        ],
        finalExplanation: {
          sections: [
            { id: sectionId, title: 'S1', prompt: 'editor prompt', exemplar: 'ADMIN EXEMPLAR' },
          ],
        },
      },
    })
    check(
      'subject admin can edit exemplar',
      adminSectionEdit.finalExplanation?.sections?.[0]?.exemplar === 'ADMIN EXEMPLAR',
    )

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

    // --- STANDING PATTERN: an Editor changing a field in EVERY container changes only
    // prose; all admin/system fields are preserved. This guards the whitelist hook: a new
    // admin field is protected by default, and this asserts the contract across containers. ---
    const base = await payload.findByID({ collection: 'lesson-bundles', id: bundle.id, depth: 0 })
    const all = await payload.update({
      collection: 'lesson-bundles',
      id: bundle.id,
      user: editorUser,
      overrideAccess: false,
      data: {
        meta: { ...(base.meta ?? {}), titleDoc: 'HACK' },
        lessons: [
          {
            id: base.lessons![0].id,
            title: 'editor lesson title',
            duration: 'HACK',
            substrand: 'HACK',
            aresKeywords: 'HACK',
            framework: [
              {
                id: base.lessons![0].framework![0].id,
                phase: 'Observe Phase',
                learnerExperience: 'editor LE',
              },
            ],
          },
        ],
        finalExplanation: {
          subjectLabel: 'HACK',
          instructions: 'editor instructions',
          sections: [
            {
              id: base.finalExplanation!.sections![0].id,
              title: 'HACK',
              prompt: 'editor prompt 2',
              exemplar: 'HACK',
            },
          ],
        },
        summaryTable: {
          subStrand: 'HACK',
          drivingQuestion: 'HACK',
          lessons: [{ id: base.summaryTable!.lessons![0].id, title: 'editor stl', observed: 'editor obs' }],
        },
      },
    })
    const adminPreserved =
      all.lessons?.[0]?.duration === base.lessons![0].duration &&
      all.lessons?.[0]?.substrand === base.lessons![0].substrand &&
      all.lessons?.[0]?.aresKeywords === base.lessons![0].aresKeywords &&
      all.lessons?.[0]?.framework?.[0]?.phase === base.lessons![0].framework![0].phase &&
      all.meta?.titleDoc === base.meta!.titleDoc &&
      all.finalExplanation?.subjectLabel === base.finalExplanation!.subjectLabel &&
      all.finalExplanation?.sections?.[0]?.title === base.finalExplanation!.sections![0].title &&
      all.finalExplanation?.sections?.[0]?.exemplar === base.finalExplanation!.sections![0].exemplar &&
      all.summaryTable?.subStrand === base.summaryTable!.subStrand &&
      all.summaryTable?.drivingQuestion === base.summaryTable!.drivingQuestion
    check('cross-container: ALL admin/system fields preserved on editor edit', adminPreserved)
    const proseApplied =
      all.lessons?.[0]?.title === 'editor lesson title' &&
      all.lessons?.[0]?.framework?.[0]?.learnerExperience === 'editor LE' &&
      all.finalExplanation?.instructions === 'editor instructions' &&
      all.finalExplanation?.sections?.[0]?.prompt === 'editor prompt 2' &&
      all.summaryTable?.lessons?.[0]?.observed === 'editor obs'
    check('cross-container: all prose edits applied on editor edit', proseApplied)
    // --- VERSIONING (SPEC §6) ---
    // Use a FRESH bundle: the `bundle` above has been updated many times by the prior
    // RBAC checks, so its semver/lockVersion are no longer at their initial values.
    const vb = track(
      'lesson-bundles',
      await payload.create({
        collection: 'lesson-bundles',
        data: {
          title: `${P}VBundle`,
          subjectGrade: sg.id,
          lessons: [
            { title: 'L1', framework: [{ phase: 'Predict Phase', learnerExperience: 'orig' }] },
          ],
        },
      }),
    )
    check('semver initialized to 1.0.0 on create', vb.semver === '1.0.0')
    check('lockVersion initialized to 0 on create', vb.lockVersion === 0)

    const vbL = vb.lessons![0].id
    const vbF = vb.lessons![0].framework![0].id
    // A draft save (draft:true) isolates the semver/bump behavior from publish status.
    const draftEdit = (user: typeof editorUser, extra: Record<string, unknown> = {}) =>
      payload.update({
        collection: 'lesson-bundles',
        id: vb.id,
        user,
        overrideAccess: false,
        draft: true,
        data: {
          ...extra,
          lessons: [
            { id: vbL, title: 'L1', framework: [{ id: vbF, phase: 'Predict Phase', learnerExperience: 'x' }] },
          ],
        },
      })

    const e1 = await draftEdit(editorUser)
    check('editor save bumps semver by patch (1.0.0 → 1.0.1)', e1.semver === '1.0.1')
    check('lockVersion increments on save (0 → 1)', e1.lockVersion === 1)
    check('bumpType reset to patch after save', e1.bumpType === 'patch')

    const e2 = await draftEdit(editorUser, { bumpType: 'minor' })
    check('editor can request minor bump (1.0.1 → 1.1.0)', e2.semver === '1.1.0')
    check('bumpType reset to patch after minor bump', e2.bumpType === 'patch')

    const e3 = await payload.update({
      collection: 'lesson-bundles',
      id: vb.id,
      user: userBUser,
      overrideAccess: false,
      draft: true,
      data: { bumpType: 'major' },
    })
    check('subject admin can request major bump (1.1.0 → 2.0.0)', e3.semver === '2.0.0')

    // Publishing (= marking official) is set via `_status: 'published'` in data; the
    // `draft` op param only toggles draft-validation. Publishing enforces required fields,
    // so these updates submit the full lessons (phase is required). The whitelist hook
    // preserves `_status` for Editors, so an Editor's publish attempt stays draft.
    const fullLessons = (le: string) => [
      { id: vbL, title: 'L1', framework: [{ id: vbF, phase: 'Predict Phase' as const, learnerExperience: le }] },
    ]
    const editorPublish = await payload.update({
      collection: 'lesson-bundles',
      id: vb.id,
      user: editorUser,
      overrideAccess: false,
      data: { _status: 'published', lessons: fullLessons('y') },
    })
    check('editor cannot publish (status stays draft)', editorPublish._status !== 'published')

    const adminPublish = await payload.update({
      collection: 'lesson-bundles',
      id: vb.id,
      user: userBUser,
      overrideAccess: false,
      data: { _status: 'published', lessons: fullLessons('admin published') },
    })
    check('subject admin can publish (mark official)', adminPublish._status === 'published')

    // An Editor editing an already-official bundle must NOT unpublish it (whitelist
    // preserves the original 'published' status even if the editor submits 'draft').
    const editorOnPublished = await payload.update({
      collection: 'lesson-bundles',
      id: vb.id,
      user: editorUser,
      overrideAccess: false,
      data: { _status: 'draft', lessons: fullLessons('z') },
    })
    check(
      'editor edit preserves official (published) status',
      editorOnPublished._status === 'published',
    )

    // --- READ BOUNDARY (SPEC §6/§8) ---
    // vb is now published (official). A brand-new bundle stays draft.
    const teacher = track(
      'users',
      await payload.create({
        collection: 'users',
        data: { name: `${P}T`, email: `${P.toLowerCase()}t@test.local`, password: 'test1234' },
      }),
    )
    const teacherUser = await payload.findByID({ collection: 'users', id: teacher.id })
    const draftOnly = track(
      'lesson-bundles',
      await payload.create({
        collection: 'lesson-bundles',
        data: {
          title: `${P}DraftOnly`,
          subjectGrade: sg.id,
          lessons: [{ title: 'L1', framework: [{ phase: 'Predict Phase', learnerExperience: 'd' }] }],
        },
      }),
    )

    const teacherFind = await payload.find({
      collection: 'lesson-bundles',
      user: teacherUser,
      overrideAccess: false,
      where: { subjectGrade: { equals: sg.id } },
      limit: 100,
      depth: 0,
    })
    const teacherIds = teacherFind.docs.map((d) => d.id)
    check('teacher reads published (official) bundle', teacherIds.includes(vb.id))
    check('teacher cannot list a draft-only bundle', !teacherIds.includes(draftOnly.id))

    const teacherDraftById = await payload.findByID({
      collection: 'lesson-bundles',
      id: draftOnly.id,
      draft: true,
      user: teacherUser,
      overrideAccess: false,
      disableErrors: true,
    })
    check('teacher cannot fetch a draft bundle by id', !teacherDraftById)

    const editorFind = await payload.find({
      collection: 'lesson-bundles',
      user: editorUser,
      overrideAccess: false,
      where: { subjectGrade: { equals: sg.id } },
      limit: 100,
      depth: 0,
    })
    check(
      'editor reads draft in their subject-grade',
      editorFind.docs.map((d) => d.id).includes(draftOnly.id),
    )

    // readVersions mirrors the boundary: a teacher must not see draft version snapshots.
    const teacherVersions = await payload.findVersions({
      collection: 'lesson-bundles',
      user: teacherUser,
      overrideAccess: false,
      where: { parent: { equals: draftOnly.id } },
      depth: 0,
    })
    check('teacher cannot read draft version snapshots', teacherVersions.totalDocs === 0)
    const editorVersions = await payload.findVersions({
      collection: 'lesson-bundles',
      user: editorUser,
      overrideAccess: false,
      where: { parent: { equals: draftOnly.id } },
      depth: 0,
    })
    check('editor reads version snapshots in their subject-grade', editorVersions.totalDocs > 0)

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
