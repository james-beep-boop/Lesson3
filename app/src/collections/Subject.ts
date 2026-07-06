import type { CollectionAfterChangeHook, CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { authenticated, canManageCurriculum, siteAdminOnly } from '../access'
import type { User } from '../payload-types'

/**
 * Delete guard (audit 2026-07-04): `subject_grades.subject_id` is NOT NULL with an ON DELETE SET
 * NULL FK, so deleting a Subject that still has SubjectGrades raised an opaque Postgres 23502.
 * Block with an actionable message instead; deleting the SubjectGrades first routes through THEIR
 * guard (which blocks on content and cascades dangling role assignments).
 */
const guardSubjectDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const sgs = await req.payload.count({
    collection: 'subject-grades',
    where: { subject: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (sgs.totalDocs > 0) {
    throw new APIError(
      `${sgs.totalDocs} subject grade(s) still belong to this subject — delete them first (their lesson plans and role assignments are checked there).`,
      409,
    )
  }
}

/**
 * SubjectGrade.displayName ("<Subject> — Grade N") is denormalized (stored at write
 * time). When a Subject is renamed, refresh the title on its SubjectGrades so they
 * don't go stale. Display-only, so a best-effort fan-out in one transaction is fine.
 */
const refreshSubjectGradeTitles: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update' || doc.name === previousDoc?.name) return doc
  // Paginated (the old single find silently capped the refresh at 1000 subject-grades — stale
  // display names past the cap). displayName updates don't affect the `subject` match, so
  // collecting all pages first is consistent within this transaction.
  const docs: { id: number | string; grade: number }[] = []
  let page = 1
  for (;;) {
    const res = await req.payload.find({
      collection: 'subject-grades',
      where: { subject: { equals: doc.id } },
      limit: 200,
      page,
      sort: 'id',
      depth: 0,
      req,
    })
    docs.push(...res.docs)
    if (!res.hasNextPage) break
    page += 1
  }
  for (const sg of docs) {
    await req.payload.update({
      collection: 'subject-grades',
      id: sg.id,
      data: { displayName: `${doc.name} — Grade ${sg.grade}` },
      req,
      overrideAccess: true, // displayName is system-only (field update access = false)
    })
  }
  return doc
}

/**
 * Subject = academic discipline only (SPEC §8). Grade lives on SubjectGrade, never
 * here. Any authenticated user may read; only Site Admins manage the taxonomy.
 */
export const Subject: CollectionConfig = {
  slug: 'subjects',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name'],
    group: 'Curriculum',
    hidden: ({ user }) => !canManageCurriculum(user as User),
  },
  access: {
    read: authenticated,
    create: siteAdminOnly,
    update: siteAdminOnly,
    delete: siteAdminOnly,
  },
  hooks: {
    afterChange: [refreshSubjectGradeTitles],
    // Actionable block while SubjectGrades still reference this subject (see guardSubjectDelete).
    beforeDelete: [guardSubjectDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
      label: 'Subject',
      admin: { description: 'Academic discipline only, e.g. "Biology". No grade here.' },
    },
  ],
}
