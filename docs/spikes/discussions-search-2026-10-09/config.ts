import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'

export default buildConfig({
  secret: 'spike-secret-not-real',
  telemetry: false,
  db: postgresAdapter({
    pool: { connectionString: process.env.SPIKE_DB ?? 'postgres://spike:spike@127.0.0.1:55499/spike' },
    push: true,
  }),
  collections: [
    { slug: 'users', auth: true, fields: [{ name: 'name', type: 'text' }] },
    {
      slug: 'discussion-topics',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'body', type: 'textarea' },
        { name: 'author', type: 'relationship', relationTo: 'users', maxDepth: 0 },
        { name: 'lastActivityAt', type: 'date', index: true },
        { name: 'pinnedAt', type: 'date', index: true },
        { name: 'lastSeq', type: 'number', defaultValue: 0 },
        { name: 'replies', type: 'join', collection: 'discussion-replies', on: 'topic' },
      ],
    },
    {
      slug: 'discussion-replies',
      indexes: [{ fields: ['topic', 'seq'], unique: true }],
      fields: [
        { name: 'topic', type: 'relationship', relationTo: 'discussion-topics', required: true, index: true },
        { name: 'seq', type: 'number', required: true },
        { name: 'body', type: 'textarea' },
        { name: 'author', type: 'relationship', relationTo: 'users', maxDepth: 0 },
      ],
    },
    {
      slug: 'discussion-participation',
      indexes: [{ fields: ['user', 'topic'], unique: true }],
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true },
        { name: 'topic', type: 'relationship', relationTo: 'discussion-topics', required: true },
        { name: 'lastReadSeq', type: 'number', required: true },
      ],
    },
  ],
})
