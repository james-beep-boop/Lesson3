import type { Field } from 'payload'

import { systemOnly } from '../access/bundle'

export const versionAuthorField: Field = {
  name: 'author',
  type: 'relationship',
  relationTo: 'users',
  index: true,
  access: { create: systemOnly, update: systemOnly },
  label: 'Saved by',
  admin: { position: 'sidebar', readOnly: true },
}

export const versionNumberField: Field = {
  name: 'semver',
  type: 'text',
  label: 'Version',
  required: true,
  defaultValue: '1.0.0',
  index: true,
  access: { create: systemOnly, update: systemOnly },
  validate: (value: null | string | undefined) =>
    /^\d+\.\d+\.\d+$/.test(value ?? '') || 'Version must be numeric x.y.z',
  admin: { position: 'sidebar', readOnly: true },
}
