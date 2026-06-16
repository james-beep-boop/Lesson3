/**
 * Seed sample logins — one Teacher, one Editor, one Subject-Grade Administrator — for testing
 * the role-tailored UI (SPEC §8 + the minimal-UI principle §13). The Site Admin already exists.
 *
 * DEV/OPERATOR tool. Needs a DB (run on the Rock or any host with DATABASE_URI):
 *   cd app && npx payload run scripts/seed-users.ts
 *
 * Credentials come from env so nothing is committed; any password left unset is randomly
 * generated and PRINTED ONCE at the end (not stored anywhere else). The Editor + Subject Admin
 * are scoped to a SubjectGrade resolved by exact (name, grade) — defaults to Biology 10.
 *
 *   TEACHER_EMAIL / EDITOR_EMAIL / SUBJECTADMIN_EMAIL   (defaults *@lesson3.local)
 *   TEACHER_PASSWORD / EDITOR_PASSWORD / SUBJECTADMIN_PASSWORD   (default: random)
 *   SEED_SUBJECT (default "Biology")   SEED_GRADE (default 10)
 *
 * Idempotent: an existing email is reported and skipped — never duplicated or overwritten.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { randomBytes } from 'node:crypto'

type Spec = {
  label: string
  email: string
  password: string
  assignmentRole?: 'editor' | 'subjectAdmin'
}

const genPassword = () => randomBytes(12).toString('base64url') // ~16 url-safe chars

const run = async () => {
  const payload = await getPayload({ config })

  const subjectName = (process.env.SEED_SUBJECT || 'Biology').trim()
  const grade = Number(process.env.SEED_GRADE || 10)

  // Resolve the SubjectGrade by exact (name, grade) — same rule as ingest. The Editor and
  // Subject Admin must attach to it; fail loud if the taxonomy isn't seeded.
  const subj = await payload.find({
    collection: 'subjects',
    where: { name: { equals: subjectName } },
    limit: 1,
    depth: 0,
  })
  const subject = subj.docs[0]
  if (!subject) {
    console.error(`No Subject named "${subjectName}". Seed taxonomy before seeding users.`)
    process.exit(1)
  }
  const sgRes = await payload.find({
    collection: 'subject-grades',
    where: { and: [{ subject: { equals: subject.id } }, { grade: { equals: grade } }] },
    limit: 1,
    depth: 0,
  })
  const sg = sgRes.docs[0]
  if (!sg) {
    console.error(`No SubjectGrade for "${subjectName}" Grade ${grade}.`)
    process.exit(1)
  }

  const specs: Spec[] = [
    {
      label: 'Teacher',
      email: process.env.TEACHER_EMAIL || 'teacher@lesson3.local',
      password: process.env.TEACHER_PASSWORD || genPassword(),
    },
    {
      label: 'Editor',
      email: process.env.EDITOR_EMAIL || 'editor@lesson3.local',
      password: process.env.EDITOR_PASSWORD || genPassword(),
      assignmentRole: 'editor',
    },
    {
      label: 'Subject Admin',
      email: process.env.SUBJECTADMIN_EMAIL || 'subjectadmin@lesson3.local',
      password: process.env.SUBJECTADMIN_PASSWORD || genPassword(),
      assignmentRole: 'subjectAdmin',
    },
  ]

  const created: { label: string; email: string; password: string; scope: string }[] = []
  for (const s of specs) {
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: s.email } },
      limit: 1,
      depth: 0,
    })
    if (existing.docs[0]) {
      console.log(`• ${s.label}: ${s.email} already exists (id ${existing.docs[0].id}) — skipped.`)
      continue
    }
    const doc = await payload.create({
      collection: 'users',
      data: {
        name: s.label,
        email: s.email,
        password: s.password,
        roles: [], // never a Site Admin via this script
        ...(s.assignmentRole ? { assignments: [{ subjectGrade: sg.id, role: s.assignmentRole }] } : {}),
      },
    })
    created.push({
      label: s.label,
      email: s.email,
      password: s.password,
      scope: s.assignmentRole
        ? `${subjectName} Grade ${grade} — ${s.assignmentRole}`
        : 'global — view/export only',
    })
    console.log(`• ${s.label}: created id ${doc.id}`)
  }

  if (created.length > 0) {
    console.log('\nCredentials (save now — passwords are not stored anywhere else):')
    for (const c of created) {
      console.log(`  ${c.label.padEnd(14)} ${c.email}   ${c.password}   [${c.scope}]`)
    }
  }
  console.log(
    '\nEditor + Subject Admin can sign in at /admin. NOTE: Teachers are excluded from the admin ' +
      'panel by design (view/export only) — a Teacher login has no surface yet (see SPEC §5/§8).',
  )
}

// Top-level await: `payload run` only awaits module evaluation (see scripts/ingest.ts note).
await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
