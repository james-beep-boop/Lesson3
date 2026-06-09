import type { CollectionAfterChangeHook, CollectionConfig } from 'payload'

import { authenticated, siteAdminOnly } from '../access'

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
  const { docs } = await req.payload.find({
    collection: 'subject-grades',
    where: { subject: { equals: doc.id } },
    limit: 1000,
    depth: 0,
    req,
  })
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
    group: 'Taxonomy',
  },
  access: {
    read: authenticated,
    create: siteAdminOnly,
    update: siteAdminOnly,
    delete: siteAdminOnly,
  },
  hooks: {
    afterChange: [refreshSubjectGradeTitles],
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
