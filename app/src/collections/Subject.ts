import type { CollectionConfig } from 'payload'

import { authenticated, siteAdminOnly } from '../access'

/**
 * Subject = academic discipline only (SPEC §8). Grade lives on SubjectGrade, never
 * here. Any authenticated user may read; only Site Admins manage the taxonomy.
 */
export const Subject: CollectionConfig = {
  slug: 'subjects',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
    group: 'Taxonomy',
  },
  access: {
    read: authenticated,
    create: siteAdminOnly,
    update: siteAdminOnly,
    delete: siteAdminOnly,
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
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: { description: 'URL-safe identifier, e.g. "biology".' },
    },
  ],
}
