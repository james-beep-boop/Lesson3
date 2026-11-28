import { APIError, type CollectionConfig } from 'payload'

import { canManageCurriculum } from '../access'
import { systemOnly } from '../access/bundle'
import {
  canSetOfficialVersion,
  lessonPlanCreate,
  lessonPlanDelete,
  lessonPlanRead,
  lessonPlanUpdate,
} from '../access/versioning'
import { downloadDeckEndpoint } from '../endpoints/downloadDeck'
import { uploadDecksEndpoint } from '../endpoints/uploadDecks'
import { refreshMutationAuthority } from '../hooks/mutationAuthority'
import { deleteSeriesVersions, guardOfficialPointer } from '../hooks/versionSeries'
import { relId } from '../lib/relId'
import { lockRows } from '../lib/txDb'
import { deckSeries } from '../lib/versionSeries'
import type { User } from '../payload-types'

const fixed = { create: systemOnly, update: systemOnly }

export const Decks: CollectionConfig = {
  slug: deckSeries.parent,
  lockDocuments: false,
  disableDuplicate: true,
  indexes: [{ fields: ['subjectGrade', 'substrandId', 'lessonNumber'], unique: true }],
  admin: {
    group: 'Curriculum',
    useAsTitle: 'title',
    defaultColumns: ['title', 'subjectGrade', 'substrandId', 'lessonNumber', 'officialVersion'],
    hidden: ({ user }) => !canManageCurriculum(user as User),
  },
  access: {
    read: lessonPlanRead,
    create: lessonPlanCreate,
    update: lessonPlanUpdate,
    delete: lessonPlanDelete,
  },
  hooks: {
    beforeOperation: [refreshMutationAuthority],
    beforeValidate: [
      ({ data, originalDoc, operation }) => {
        if (operation !== 'update' || !data || !originalDoc) return data
        for (const field of ['lessonPlan', 'subjectGrade', 'substrandId', 'lessonNumber']) {
          if (!(field in data)) continue
          const normalize = field === 'lessonPlan' || field === 'subjectGrade' ? relId : String
          if (normalize(data[field]) !== normalize(originalDoc[field])) {
            throw new APIError('A deck stays with the lesson it was uploaded for.', 400)
          }
        }
        return data
      },
      guardOfficialPointer(deckSeries),
    ],
    beforeDelete: [
      async ({ id, req }) => {
        await lockRows(req, deckSeries.table, [Number(id)])
        await deleteSeriesVersions(req, deckSeries, id)
      },
    ],
  },
  endpoints: [uploadDecksEndpoint, downloadDeckEndpoint],
  fields: [
    { name: 'title', type: 'text', required: true, access: fixed },
    {
      name: 'lessonPlan',
      type: 'relationship',
      relationTo: 'lesson-plans',
      required: true,
      access: fixed,
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      access: fixed,
    },
    { name: 'substrandId', type: 'text', label: 'Sub-strand ID', required: true, access: fixed },
    { name: 'lessonNumber', type: 'number', required: true, min: 1, access: fixed },
    {
      name: 'officialVersion',
      type: 'relationship',
      relationTo: deckSeries.versions,
      access: { update: canSetOfficialVersion },
    },
    {
      name: 'importFingerprint',
      type: 'text',
      required: true,
      admin: { hidden: true },
      access: { ...fixed, read: systemOnly },
    },
  ],
}
