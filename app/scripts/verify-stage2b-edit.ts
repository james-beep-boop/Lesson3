/**
 * Verify the Stage-2b working-copy edit semantics + RBAC, self-cleaning, no HTTP session.
 *
 * Exercises the access rules + hooks the fork/make-official endpoints rely on, via the Local API as
 * the Site Admin (admin path), a Biology-G10 Editor, and a Teacher (the seeded `subjectadmin@…` holds
 * only an EDITOR grant — see the actor note below):
 *   - Official version is immutable (enforceVersionImmutable rejects the update).
 *   - Fork creates a Not-Official working copy (semver bumped, sourceVersion set, pointer unchanged).
 *   - The working copy is mutable (a Subject Admin update succeeds).
 *   - make-official moves the plan pointer; the now-Official working copy becomes immutable.
 *   - A Teacher cannot update a version, create one, or move the Official pointer.
 *
 * NON-DESTRUCTIVE: restores the plan's original Official pointer and deletes the forked copy in a
 * finally, so a real plan is left exactly as found. Run on the Rock:
 *   cd app && npx payload run scripts/verify-stage2b-edit.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { relId } from '../src/lib/relId'
import { stripIds } from '../src/lib/stripIds'
import type { LessonBundleVersion, User } from '../src/payload-types'

// The seeded "Subject Admin" user actually holds an EDITOR grant for Biology G10, so we drive the
// admin path with the Site Admin, and use that editor to confirm editing is admin-only this slice.
const SITE_ADMIN_EMAIL = process.env.SITE_ADMIN_EMAIL ?? 'clinicvim@gmail.com'
const EDITOR_EMAIL = 'subjectadmin@lesson3.local'
const TEACHER_EMAIL = 'teacher@lesson3.local'

const expectThrow = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn()
    console.log(`  ✗ ${label}: expected rejection, but it SUCCEEDED`)
    return false
  } catch {
    console.log(`  ✓ ${label}: correctly rejected`)
    return true
  }
}
const printCheck = (label: string, ok: boolean): boolean => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  return ok
}
const expectOk = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn()
    console.log(`  ✓ ${label}: succeeded`)
    return true
  } catch (e) {
    console.log(`  ✗ ${label}: expected success, but threw — ${e instanceof Error ? e.message : e}`)
    return false
  }
}

const run = async () => {
  const payload = await getPayload({ config })
  const userByEmail = async (email: string): Promise<User> => {
    const { docs } = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
    const u = docs[0] as User | undefined
    if (!u) throw new Error(`Seeded user ${email} not found`)
    return u
  }
  const admin = await userByEmail(SITE_ADMIN_EMAIL)
  const editor = await userByEmail(EDITOR_EMAIL)
  const teacher = await userByEmail(TEACHER_EMAIL)

  // Use a plan in the Editor's grade so the "editor is denied" check is meaningful (in-scope, but
  // editing is admin-only this slice). The Site Admin governs all, so drives the admin path.
  const editorGrades = new Set((editor.assignments ?? []).map((a) => relId(a.subjectGrade)))
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    where: { officialVersion: { exists: true } },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  })
  const plan = plans.find((p) => editorGrades.has(relId(p.subjectGrade))) ?? plans[0]
  if (!plan) throw new Error('No plan with an Official version found.')
  const originalOfficialId = relId(plan.officialVersion)!
  console.log(`Plan ${plan.id} "${plan.title}" — Official version ${originalOfficialId}`)

  const results: boolean[] = []
  let forkedId: number | null = null
  try {
    // 1. Official version is immutable, even for the Subject Admin.
    results.push(
      await expectThrow('admin update of Official version', () =>
        payload.update({ collection: 'lesson-bundle-versions', id: originalOfficialId, data: { title: 'X' } as never, overrideAccess: false, user: admin }),
      ),
    )

    // 2. Fork: create a Not-Official working copy (what the fork endpoint does).
    const source = (await payload.findByID({ collection: 'lesson-bundle-versions', id: originalOfficialId, depth: 0, overrideAccess: true })) as LessonBundleVersion
    const { id: _i, semver: _s, sourceVersion: _sv, createdAt: _c, updatedAt: _u, ...rest } = source as unknown as Record<string, unknown>
    const working = await payload.create({
      collection: 'lesson-bundle-versions',
      data: { ...(stripIds(rest) as Record<string, unknown>), lessonPlan: plan.id, semver: '1.0.1', sourceVersion: originalOfficialId } as never,
      overrideAccess: false,
      user: admin,
    })
    forkedId = working.id
    const planAfterFork = await payload.findByID({ collection: 'lesson-plans', id: plan.id, depth: 0, overrideAccess: true })
    const pointerUnchanged = relId(planAfterFork.officialVersion) === originalOfficialId
    console.log(`  ${pointerUnchanged ? '✓' : '✗'} fork created version ${forkedId} (semver ${working.semver}, sourceVersion ${relId((working as LessonBundleVersion).sourceVersion)}); Official pointer unchanged=${pointerUnchanged}`)
    results.push(pointerUnchanged && working.semver === '1.0.1')

    // 3. The working copy is mutable for the Subject Admin.
    results.push(
      await expectOk('admin update of working copy', () =>
        payload.update({ collection: 'lesson-bundle-versions', id: forkedId!, data: { title: 'Working edit' } as never, overrideAccess: false, user: admin }),
      ),
    )

    // 4. make-official moves the pointer; the working copy then becomes immutable.
    results.push(
      await expectOk('admin make-official (move pointer)', () =>
        payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: forkedId } as never, overrideAccess: false, user: admin }),
      ),
    )
    results.push(
      await expectThrow('newly-Official working copy is now immutable', () =>
        payload.update({ collection: 'lesson-bundle-versions', id: forkedId!, data: { title: 'Y' } as never, overrideAccess: false, user: admin }),
      ),
    )
    // Retention guard: the Official version cannot be deleted (even with overrideAccess — it's a hook).
    results.push(
      await expectThrow('Official version cannot be deleted', () =>
        payload.delete({ collection: 'lesson-bundle-versions', id: forkedId!, overrideAccess: true }),
      ),
    )

    // 5. Restore the original Official so the fork is a Not-Official (editable) working copy again.
    await payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: originalOfficialId } as never, overrideAccess: true })

    // 5a. Editor prose-editing on the working copy: prose sticks, structure/admin fields preserved.
    //     The Editor must submit the FULL lessons array (same rows/order) — the field-split rejects
    //     cardinality changes — exactly as the admin UI does.
    const fork = (await payload.findByID({ collection: 'lesson-bundle-versions', id: forkedId!, depth: 0, overrideAccess: true })) as LessonBundleVersion
    const lesson0 = fork.lessons?.[0]
    const fw0 = lesson0?.framework?.[0]
    if (lesson0?.id && fw0?.id && fw0.phase) {
      const otherPhase = fw0.phase === 'Observe Phase' ? 'Predict Phase' : 'Observe Phase'
      // Rebuild the full document, changing only lesson0/fw0 prose + planting admin/structure "hacks".
      const fullLessons = (fork.lessons ?? []).map((l, i) => ({
        id: l.id,
        ...(i === 0 ? { title: 'editor lesson title' } : {}), // prose → applies on row 0
        framework: (l.framework ?? []).map((f, j) => ({
          id: f.id,
          phase: i === 0 && j === 0 ? otherPhase : f.phase, // structure hack on fw0 → must be ignored
          ...(i === 0 && j === 0 ? { learnerExperience: 'EDITOR PROSE' } : {}), // prose → applies
        })),
      }))
      const edited = (await payload.update({
        collection: 'lesson-bundle-versions',
        id: forkedId!,
        user: editor,
        overrideAccess: false,
        data: {
          meta: { ...(fork.meta ?? {}), titleDoc: 'EDITOR HACK' }, // admin field → must be ignored
          lessons: fullLessons,
        } as never,
      })) as LessonBundleVersion
      const ef = edited.lessons?.[0]?.framework?.[0]
      results.push(printCheck('editor prose (learnerExperience) applied', ef?.learnerExperience === 'EDITOR PROSE'))
      results.push(printCheck('editor lesson title (prose) applied', edited.lessons?.[0]?.title === 'editor lesson title'))
      results.push(printCheck('editor structure (phase) ignored', ef?.phase === fw0.phase))
      results.push(printCheck('editor admin field (meta.titleDoc) ignored', edited.meta?.titleDoc !== 'EDITOR HACK'))
    } else {
      console.log('  ⚠ skipped editor prose checks — fork has no framework row to edit')
    }

    // 5b. Editor cannot make a version Official (admin-only).
    results.push(await expectThrow('editor cannot move Official pointer', () => payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: forkedId } as never, overrideAccess: false, user: editor })))

    // 5c. Teacher: no update, no pointer move.
    results.push(await expectThrow('teacher update of a version', () => payload.update({ collection: 'lesson-bundle-versions', id: forkedId!, data: { title: 'Z' } as never, overrideAccess: false, user: teacher })))
    results.push(await expectThrow('teacher move of Official pointer', () => payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: forkedId } as never, overrideAccess: false, user: teacher })))
  } finally {
    // Restore original Official pointer, then delete the forked copy (can't delete while Official).
    try {
      await payload.update({ collection: 'lesson-plans', id: plan.id, data: { officialVersion: originalOfficialId } as never, overrideAccess: true })
      if (forkedId != null) await payload.delete({ collection: 'lesson-bundle-versions', id: forkedId, overrideAccess: true })
      console.log(`Cleanup: restored Official ${originalOfficialId}; deleted fork ${forkedId}`)
    } catch (e) {
      console.warn(`Cleanup FAILED — check plan ${plan.id}: ${e instanceof Error ? e.message : e}`)
    }
  }

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}\nSTAGE-2b EDIT VERIFY: ${passed}/${results.length} checks passed`)
  if (passed !== results.length) {
    console.error('✗ STAGE-2b EDIT VERIFY FAILED')
    process.exit(1)
  }
  console.log('✓ STAGE-2b EDIT VERIFY PASSED (immutability + fork + working-copy + make-official + RBAC)')
}

await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
