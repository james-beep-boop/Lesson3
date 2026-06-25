import type { CollectionConfig, CollectionSlug } from 'payload'

import {
  canSetOfficialVersion,
  lessonPlanCreate,
  lessonPlanDelete,
  lessonPlanRead,
  lessonPlanUpdate,
} from '../access/versioning'
import { canEditStructure } from '../access/bundle'
import { validateOfficialVersionPointer } from '../hooks/lessonPlan'
import { uploadBundlesEndpoint } from '../endpoints/uploadBundles'

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subjectGrade', 'officialVersion'],
    group: 'Lesson plans',
    components: {
      // Site-Admin-only upload panel above the list (SPEC §7 deviation — self-hides for others).
      // Import creates a LessonPlan + Official 1.0.0 version, so this is its natural home.
      beforeListTable: ['@/components/UploadBundles#default'],
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
