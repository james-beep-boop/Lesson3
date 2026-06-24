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

export const LessonPlans: CollectionConfig = {
  slug: 'lesson-plans',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'subjectGrade', 'officialVersion'],
    group: 'Lesson plans',
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
