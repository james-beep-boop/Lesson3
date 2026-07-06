import type { CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { authenticated, canManageCurriculum, siteAdminOnly, toId } from '../access'
import type { User } from '../payload-types'

/**
 * Delete guard (audit 2026-07-04). `lesson_plans.subject_grade_id`, `lesson_bundle_versions.
 * subject_grade_id` and `users_assignments.subject_grade_id` are all NOT NULL with ON DELETE SET
 * NULL FKs, so deleting a referenced SubjectGrade raised Postgres 23502 — surfaced in the admin as
 * the opaque "An unknown error has occurred" (the same trap the plan/user cascades close).
 *
 *  - CONTENT blocks the delete with an actionable message: removing lesson plans as a taxonomy
 *    side effect would be far too destructive to cascade.
 *  - ROLE ASSIGNMENTS cascade: a grant scoped to a subject-grade that is going away is meaningless,
 *    so the rows are removed from their holders (same fan-out shape as autoDemotePriorSubjectAdmins;
 *    `skipAutoDemote` because removing rows can never grant anything).
 *
 * Runs on every path incl. system/overrideAccess — same posture as `enforceOfficialNotDeletable`;
 * callers that legitimately clear a subject-grade (fixture teardown) delete its content first.
 */
const guardSubjectGradeDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const plans = await req.payload.count({
    collection: 'lesson-plans',
    where: { subjectGrade: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (plans.totalDocs > 0) {
    throw new APIError(
      `${plans.totalDocs} lesson plan(s) still use this subject grade — delete them (Manage → Delete lesson plans) or move them to another subject grade first.`,
      409,
    )
  }
  // Versions normally go with their plan, but check directly too — an orphaned row would 23502 the
  // same way, and this message beats that one.
  const versions = await req.payload.count({
    collection: 'lesson-bundle-versions',
    where: { subjectGrade: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (versions.totalDocs > 0) {
    throw new APIError(
      `${versions.totalDocs} lesson plan version(s) still reference this subject grade — delete them first.`,
      409,
    )
  }

  // Collect EVERY holder before writing (paginated, mirroring autoDemotePriorSubjectAdmins): the
  // old single find silently capped at 1000, and leftovers past the cap would hit the very
  // FK/not-null failure this guard exists to prevent. Collect-then-write, not walk-and-write —
  // each update removes the holder from the match set, which would skip rows mid-walk.
  const holders: User[] = []
  let page = 1
  for (;;) {
    const res = await req.payload.find({
      collection: 'users',
      where: { 'assignments.subjectGrade': { equals: id } },
      depth: 0,
      limit: 200,
      page,
      sort: 'id',
      overrideAccess: true,
      req,
    })
    holders.push(...res.docs)
    if (!res.hasNextPage) break
    page += 1
  }
  for (const holder of holders) {
    await req.payload.update({
      collection: 'users',
      id: holder.id,
      data: {
        assignments: (holder.assignments ?? []).filter((a) => toId(a.subjectGrade) !== Number(id)),
      },
      overrideAccess: true,
      req,
      context: { skipAutoDemote: true },
    })
  }
}

/**
 * SubjectGrade = subject + integer grade (SPEC §8). The assignable unit roles
 * attach to. Displayed as "<Subject> — Grade N". "Math Grade 4" and "Math Grade 5"
 * are independent. `class` is a reserved word — the entity is always SubjectGrade.
 */
export const SubjectGrade: CollectionConfig = {
  slug: 'subject-grades',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'subject', 'grade'],
    group: 'Curriculum',
    hidden: ({ user }) => !canManageCurriculum(user as User),
  },
  // DB-level guarantee that (subject, grade) is unique — Payload's native compound index
  // (verified in installed source: collections/config/types `indexes`). The beforeValidate
  // check below is kept for a friendly error message (a raw unique-constraint violation is
  // opaque); together = defense in depth (hard DB constraint + good UX). See
  // docs/DECISIONS.md 2026-06-09.
  indexes: [{ unique: true, fields: ['subject', 'grade'] }],
  access: {
    read: authenticated,
    create: siteAdminOnly,
    update: siteAdminOnly,
    delete: siteAdminOnly,
  },
  hooks: {
    // Actionable block on referenced content + assignment-row cascade (see guardSubjectGradeDelete).
    beforeDelete: [guardSubjectGradeDelete],
    beforeValidate: [
      // Friendly duplicate check (the hard guarantee is the compound unique index above).
      async ({ data, req, originalDoc }) => {
        if (!data?.subject || data?.grade == null) return data
        const subjectId = typeof data.subject === 'object' ? data.subject.id : data.subject
        const existing = await req.payload.find({
          collection: 'subject-grades',
          depth: 0,
          limit: 1,
          req,
          where: {
            and: [{ subject: { equals: subjectId } }, { grade: { equals: data.grade } }],
          },
        })
        const clash = existing.docs[0]
        if (clash && clash.id !== originalDoc?.id) {
          throw new Error(`Grade ${data.grade} already exists for that subject.`)
        }
        return data
      },
    ],
    beforeChange: [
      // Maintain the stored "<Subject> — Grade N" title (a virtual field can't be
      // useAsTitle unless it maps to a single relationship field).
      async ({ data, req }) => {
        if (!data || data.grade == null) return data
        const subjectId = typeof data.subject === 'object' ? data.subject?.id : data.subject
        let subjectName: string | undefined
        if (subjectId != null) {
          const subject = await req.payload
            .findByID({ collection: 'subjects', id: subjectId, depth: 0, req })
            .catch(() => null)
          subjectName = subject?.name
        }
        data.displayName = subjectName
          ? `${subjectName} — Grade ${data.grade}`
          : `Grade ${data.grade}`
        return data
      },
    ],
  },
  fields: [
    {
      name: 'subject',
      type: 'relationship',
      relationTo: 'subjects',
      required: true,
    },
    {
      name: 'grade',
      type: 'number',
      required: true,
      min: 1,
      admin: { step: 1, description: 'Whole number; displayed as "Grade N".' },
      validate: (value: number | null | undefined) =>
        value == null || Number.isInteger(value) || 'Grade must be a whole number.',
    },
    {
      // Stored "<Subject> — Grade N" title, kept current by the beforeChange hook.
      name: 'displayName',
      type: 'text',
      admin: { readOnly: true, description: 'Auto-generated from subject + grade.' },
      access: { update: () => false },
    },
  ],
}
