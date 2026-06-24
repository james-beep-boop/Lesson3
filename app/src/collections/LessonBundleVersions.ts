import type { CollectionConfig, CollectionSlug, Field } from 'payload'

import {
  lessonBundleVersionCreate,
  lessonBundleVersionDelete,
  lessonBundleVersionRead,
  lessonBundleVersionUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import {
  enforceBundleVersionGeneratable,
  numberBundleVersionRows,
} from '../hooks/bundleVersion'
import { LessonBundles } from './LessonBundles'

const LEGACY_VERSION_FIELDS = new Set(['semver', 'bumpType', 'lockVersion', 'title', 'subjectGrade'])

const bundleContentFields = (LessonBundles.fields as Field[]).filter((field) => {
  if (!('name' in field)) return true
  return !LEGACY_VERSION_FIELDS.has(field.name)
})

export const LessonBundleVersions: CollectionConfig = {
  slug: 'lesson-bundle-versions',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'lessonPlan', 'semver', 'subjectGrade', 'createdAt'],
    group: 'Lesson plans',
    description:
      'Immutable lesson-plan snapshots. The parent Lesson Plan chooses one snapshot as Official.',
  },
  access: {
    read: lessonBundleVersionRead,
    create: lessonBundleVersionCreate,
    update: lessonBundleVersionUpdate,
    delete: lessonBundleVersionDelete,
  },
  hooks: {
    beforeValidate: [numberBundleVersionRows, enforceBundleVersionGeneratable],
  },
  fields: [
    {
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans' as CollectionSlug,
      required: true,
      index: true,
      access: { update: canEditStructure },
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'sourceVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions' as CollectionSlug,
      admin: {
        position: 'sidebar',
        description: 'Version this snapshot was edited from. Empty for uploaded 1.0.0.',
      },
    },
    {
      name: 'semver',
      type: 'text',
      required: true,
      defaultValue: '1.0.0',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      access: { update: canEditStructure },
      admin: {
        description: 'Version label for lists, e.g. the document title.',
      },
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      index: true,
      access: { update: canEditStructure },
    },
    ...bundleContentFields,
  ],
}
