import type { Field, FieldHook } from 'payload'
import { systemOnly } from '../access/bundle'
import { relId } from '../lib/relId'

/** Field beforeChange runs for overrideAccess too (Payload 3.92). Submitted audit values are ignored.
 * Native pointer updates and ingest both hold the plan lock before reading the previous Official.
 * FK SET NULL on deletion clears the references without inventing another pointer change.
 */
const stamp =
  (name: 'officialChangedAt' | 'officialChangedFrom' | 'officialChangedBy'): FieldHook =>
  ({ data, originalDoc, req, operation, previousValue }) => {
    const from = relId(originalDoc?.officialVersion)
    const to = data && 'officialVersion' in data ? relId(data.officialVersion) : from
    if (from === to) return operation === 'create' ? null : (previousValue ?? null)
    if (name === 'officialChangedAt') return new Date().toISOString()
    if (name === 'officialChangedFrom') return from
    return req.user?.id ?? null
  }
export const officialChangeFields: Field[] = [
  { name: 'officialChangedAt', type: 'date' },
  { name: 'officialChangedFrom', type: 'relationship', relationTo: 'lesson-bundle-versions' },
  { name: 'officialChangedBy', type: 'relationship', relationTo: 'users' },
].map((field) => ({
  ...field,
  access: { create: systemOnly, update: systemOnly },
  admin: { hidden: true, readOnly: true },
  hooks: { beforeChange: [stamp(field.name as Parameters<typeof stamp>[0])] },
})) as Field[]
