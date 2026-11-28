import { ValidationError, type CollectionConfig } from 'payload'

import { canManageCurriculum } from '../access'
import { systemOnly } from '../access/bundle'
import {
  enforceVersionImmutable,
  versionUpdateGrantForFormRenderOnly,
} from '../access/versionImmutability'
import {
  lessonBundleVersionCreate,
  lessonBundleVersionDelete,
  lessonBundleVersionRead,
} from '../access/versioning'
import { deckFieldErrors, deckFieldSplit, deckSpecFields, readDeckSpec } from '../decks/storage'
import { promoteVersionEndpoint, saveVersionEndpoint } from '../endpoints/versionEdit'
import { versionAuthorField, versionNumberField } from '../fields/versionMetadata'
import { refreshMutationAuthority } from '../hooks/mutationAuthority'
import { guardOfficialDeletion, guardVersionSubjectGrade } from '../hooks/versionSeries'
import { canonicalJson } from '../lib/canonicalJson'
import { deckSeries } from '../lib/versionSeries'
import type { User } from '../payload-types'

const fixed = { create: systemOnly, update: systemOnly }

export const DeckVersions: CollectionConfig = {
  slug: deckSeries.versions,
  lockDocuments: false,
  disableDuplicate: true,
  indexes: [{ fields: [deckSeries.parentKey, 'semver'], unique: true }],
  admin: {
    group: 'Curriculum',
    useAsTitle: 'semver',
    defaultColumns: ['deck', 'semver', 'author', 'updatedAt'],
    hidden: ({ user }) => !canManageCurriculum(user as User),
  },
  access: {
    read: lessonBundleVersionRead,
    create: lessonBundleVersionCreate,
    update: versionUpdateGrantForFormRenderOnly,
    delete: lessonBundleVersionDelete,
  },
  hooks: {
    beforeOperation: [refreshMutationAuthority],
    beforeValidate: [
      guardVersionSubjectGrade(deckSeries),
      ({ data, operation, req }) => {
        if (operation !== 'create' || !data) return data
        const errors = deckFieldErrors(data)
        if (errors.length) {
          throw new ValidationError({ collection: deckSeries.versions, errors }, req.t)
        }
        return data
      },
    ],
    beforeChange: [enforceVersionImmutable],
    beforeDelete: [guardOfficialDeletion(deckSeries)],
  },
  endpoints: [
    saveVersionEndpoint(deckSeries, {
      policy: deckFieldSplit,
      validate: deckFieldErrors,
      compare: (content) => canonicalJson(readDeckSpec(content.spec)),
    }),
    promoteVersionEndpoint(deckSeries),
  ],
  fields: [
    {
      name: deckSeries.parentKey,
      type: 'relationship',
      relationTo: deckSeries.parent,
      required: true,
      access: fixed,
      admin: { hidden: true },
    },
    {
      name: 'subjectGrade',
      type: 'relationship',
      relationTo: 'subject-grades',
      required: true,
      access: fixed,
      admin: { hidden: true },
    },
    {
      name: 'sourceVersion',
      type: 'relationship',
      relationTo: deckSeries.versions,
      access: fixed,
      label: 'Based on version',
      admin: { position: 'sidebar', readOnly: true },
    },
    versionAuthorField,
    versionNumberField,
    { name: 'spec', type: 'group', fields: deckSpecFields },
  ],
}
