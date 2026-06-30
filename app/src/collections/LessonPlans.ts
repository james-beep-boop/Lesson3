import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  canSetOfficialVersion,
  lessonPlanCreate,
  lessonPlanDelete,
  lessonPlanRead,
  lessonPlanUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import { cascadeDeleteLessonPlanVersions, validateOfficialVersionPointer } from '../hooks/lessonPlan'
import { uploadBundlesEndpoint } from '../endpoints/uploadBundles'

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subjectGrade', 'officialVersion'],
    group: 'Lesson plans',
    components: {
      // Replace Payload's default list TABLE (which repeated the subject-grade three ways per row)
      // with a strand-first catalogue that mirrors the public browse page. The view renders the
      // Site-Admin upload panel itself (the old `beforeListTable` slot does not fire when the whole
      // list view is overridden) and adds Site-Admin bulk-delete. See the component for the why.
      views: {
        list: { Component: '@/components/AdminLessonList#default' },
      },
    },
  },
  access: {
    read: lessonPlanRead,
    create: lessonPlanCreate,
    update: lessonPlanUpdate,
    delete: lessonPlanDelete,
  },
  hooks: {
    beforeValidate: [validateOfficialVersionPointer],
    // Deleting a plan must first remove its child versions (NOT NULL lesson_plan_id + ON DELETE SET
    // NULL FK → Postgres 23502 otherwise, shown as "An unknown error has occurred"). SPEC §6.
    beforeDelete: [cascadeDeleteLessonPlanVersions],
  },
  endpoints: [
    // POST /api/lesson-plans/upload — Site-Admin-only JSON ingest (SPEC §7 deviation).
    uploadBundlesEndpoint,
  ],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      access: { update: canEditStructure },
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      access: { update: canEditStructure },
    },
    {
      name: 'officialVersion',
      type: 'relationship',
      relationTo: 'lesson-bundle-versions' as CollectionSlug,
      admin: {
        position: 'sidebar',
        description: 'The single global Official version for this lesson plan.',
      },
      access: {
        update: canSetOfficialVersion,
      },
    },
  ],
}
