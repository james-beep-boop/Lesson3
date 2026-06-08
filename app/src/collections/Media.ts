import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  // No access override: Payload's default access is `Boolean(user)`, so all
  // operations (including read) require an authenticated user. Gate behind an
  // explicit public-asset policy before relaxing read.
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
