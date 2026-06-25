/**
 * Verify the Stage-2b-finish version PREVIEW path: the saved-render and unsaved field-split logic
 * the admin Preview control drives through `/api/lesson-bundle-versions/:id/preview`. No HTTP — it
 * exercises the exact units the endpoints delegate to (`renderBundlePreview`, the edit-authority
 * gate `isEditorFor`, and the version field-split `enforceVersionFieldSplit`). The thin HTTP layer
 * on top is separately auth-gated (401 unauth) and shares the page shell with the proven bundle
 * preview.
 *
 * Checks:
 *   - SAVED preview renders a non-empty content view for a stored version.
 *   - UNSAVED preview as an Editor: a prose edit is applied; an admin/structural edit is reverted
 *     (field-split whitelist), and a cardinality change is rejected (Forbidden → 422 at the endpoint).
 *   - A Teacher has no edit authority (the POST gate would 404 them).
 *
 * READ-ONLY w.r.t. app data (renders in memory; persists nothing). Run on the Rock:
 *   cd app && npx payload run scripts/verify-stage2b-preview.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { Forbidden } from 'payload'

import { relId } from '../src/lib/relId'
import { renderBundlePreview } from '../src/generator/previewBundle'
import { enforceVersionFieldSplit } from '../src/hooks/bundleVersion'
import { isEditorFor, toId } from '../src/access'
import type { LessonBundleVersion, User } from '../src/payload-types'

const EDITOR_EMAIL = 'subjectadmin@lesson3.local' // holds an EDITOR grant for Biology G10 (see DECISIONS)
const TEACHER_EMAIL = 'teacher@lesson3.local'

// enforceVersionFieldSplit → applyEditorFieldSplit is a pure sync function needing only req.user + req.t.
const reqFor = (user: User) => ({ user, t: ((k: string) => k) as never }) as never

const run = async () => {
  const payload = await getPayload({ config })
  const userByEmail = async (email: string): Promise<User> => {
    const { docs } = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
    const u = docs[0] as User | undefined
    if (!u) throw new Error(`Seeded user ${email} not found`)
    return u
  }
  const editor = await userByEmail(EDITOR_EMAIL)
  const teacher = await userByEmail(TEACHER_EMAIL)

  // A version in the Editor's grade, so the field-split is actually exercised (not the admin bypass).
  const editorGrades = new Set((editor.assignments ?? []).map((a) => relId(a.subjectGrade)))
  const { docs: versions } = await payload.find({
    collection: 'lesson-bundle-versions',
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })
  const version = (versions.find((v) => editorGrades.has(relId(v.subjectGrade))) ?? versions[0]) as
    | LessonBundleVersion
    | undefined
  if (!version) throw new Error('No lesson-bundle-version found.')
  console.log(`Version ${version.id} "${version.title}" — subjectGrade ${relId(version.subjectGrade)}`)

  const results: boolean[] = []
  const check = (label: string, ok: boolean): void => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`)
    results.push(ok)
  }

  // 1. SAVED render — what GET /preview returns.
  const sections = await renderBundlePreview(version, 'standard')
  check('saved version renders a non-empty content preview', sections.length > 0 && sections.every((s) => s.html.length > 0))

  // 2. UNSAVED render as an Editor — prose applied, structure/admin reverted (field-split whitelist).
  const editorIsScoped = isEditorFor(editor, toId(version.subjectGrade))
  check('editor has edit authority for the version (POST gate passes)', editorIsScoped)

  const firstLesson = (version.lessons ?? [])[0]
  if (firstLesson) {
    const candidate = {
      ...(version as unknown as Record<string, unknown>),
      title: 'ADMIN-ONLY EDIT — should be reverted',
      lessons: (version.lessons ?? []).map((l, i) =>
        i === 0 ? { ...l, overview: 'EDITOR PROSE EDIT', duration: 'ADMIN-ONLY — reverted' } : l,
      ),
    }
    const effective = enforceVersionFieldSplit({
      data: candidate,
      operation: 'update',
      originalDoc: version as unknown as Record<string, unknown>,
      req: reqFor(editor),
    } as never) as unknown as { title?: string; lessons?: Array<{ overview?: string; duration?: string }> }

    check('editor prose edit (lesson.overview) is applied', effective.lessons?.[0]?.overview === 'EDITOR PROSE EDIT')
    check('editor admin-field edit (title) is reverted', effective.title === version.title)
    check('editor admin-field edit (lesson.duration) is reverted', effective.lessons?.[0]?.duration === firstLesson.duration)

    // Cardinality change by an Editor → Forbidden (endpoint maps to 422).
    let rejected = false
    try {
      enforceVersionFieldSplit({
        data: { ...candidate, lessons: (version.lessons ?? []).slice(0, Math.max(0, (version.lessons ?? []).length - 1)) },
        operation: 'update',
        originalDoc: version as unknown as Record<string, unknown>,
        req: reqFor(editor),
      } as never)
    } catch (e) {
      rejected = e instanceof Forbidden
    }
    check('editor row-removal (cardinality change) is rejected', rejected)
  } else {
    console.log('  (version has no lessons — skipping field-split overlay checks)')
  }

  // 3. A Teacher has no edit authority — the POST gate would 404 them.
  check('teacher has NO edit authority for the version', !isEditorFor(teacher, toId(version.subjectGrade)))

  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} checks passed`)
  if (passed !== results.length) process.exitCode = 1
}

await run()
