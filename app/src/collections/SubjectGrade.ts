import type { CollectionConfig } from 'payload'

import { authenticated, canManageCurriculum, siteAdminOnly } from '../access'
import type { User } from '../payload-types'

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
