import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  canSetOfficialVersion,
  lessonPlanCreate,
  lessonPlanDelete,
  lessonPlanRead,
  lessonPlanUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import { cascadeDeleteLessonPlanVersions, validateOfficialVersionPointer, prewarmOfficialArtifacts } from '../hooks/lessonPlan'
import { uploadBundlesEndpoint } from '../endpoints/uploadBundles'
import { requestEditingEndpoint } from '../endpoints/requestEditing'

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'title',
    group: 'Lesson plans',
    components: {
      // IA redesign PR ③: there is no admin lesson-plans LIST — the library (`/`) is the only list of
      // lessons and Manage owns the functions (upload / repair / delete), so the list route redirects
      // to Manage. The DOCUMENT (edit) view stays: it is the Official-pointer repair form, reached
      // from Manage's Repair links. Nav entry hidden in custom.scss (`nav-group-Lesson plans`).
      views: {
        list: { Component: '@/components/RedirectToManage#default' },
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
    // Any authenticated Official-pointer move pre-warms that version's export artifacts (T1).
    afterChange: [prewarmOfficialArtifacts],
    // Deleting a plan must first remove its child versions (NOT NULL lesson_plan_id + ON DELETE SET
    // NULL FK → Postgres 23502 otherwise, shown as "An unknown error has occurred"). SPEC §6.
    // Favorites are per-version (§10) and cascade from the version delete itself.
    beforeDelete: [cascadeDeleteLessonPlanVersions],
  },
  endpoints: [
    // POST /api/lesson-plans/upload — Site-Admin-only JSON ingest (SPEC §7 deviation).
    uploadBundlesEndpoint,
    // POST /api/lesson-plans/:id/request-editing — message the sg's admins for Editor access (T3).
    requestEditingEndpoint,
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
