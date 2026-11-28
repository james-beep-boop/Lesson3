import { randomUUID } from 'node:crypto'
import { extname, join } from 'node:path'
import { sql } from '@payloadcms/db-postgres'
import { APIError, type Access, type CollectionConfig, type Payload } from 'payload'

import {
  isSiteAdmin,
  isSubjectAdminFor,
  isSubjectAdminForAny,
  subjectGradeIdsByRole,
  toId,
} from '@/access'
import { importSupportingFilesEndpoint } from '@/endpoints/importSupportingFiles'
import { relId } from '@/lib/relId'
import { SUPPORTING_FILE_KINDS } from '@/lib/supportingFiles'
import { poolDb, rowsOf } from '@/lib/txDb'
import type { User } from '@/payload-types'

const storageRoot = join(process.env.ARTIFACT_CACHE_DIR || '/var/cache/lesson3', 'supporting-files')

// A PostgreSQL database keeps its OID when restore-db.sh renames it. Each staged, live and previous
// database therefore keeps its own bytes through restore, interruption and undo.
export async function setSupportingFileDirectory(payload: Payload) {
  const [database] = rowsOf(
    await poolDb(payload).execute(
      sql`SELECT oid::text FROM pg_database WHERE datname = current_database()`,
    ),
  )
  const oid = database?.oid
  const upload = payload.collections['supporting-files'].config.upload
  if (upload && typeof oid === 'string') upload.staticDir = join(storageRoot, oid)
  else throw new Error('Could not resolve the supporting files directory for this database.')
}

const read: Access = async ({ req, isReadingStaticFile }) => {
  if (!req.user && isReadingStaticFile) throw new APIError('Sign in to download this file.', 401)
  if (!req.user) return false
  if (isReadingStaticFile) {
    const filename = req.routeParams?.filename
    if (typeof filename !== 'string') throw new APIError('File not found.', 404)
    // Payload can serve a disk file without resolving its document when read access returns true.
    // Require a current row so uncommitted uploads and leftover files have no download URL.
    const { docs } = await req.payload.find({
      collection: 'supporting-files',
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      select: {},
      req,
      overrideAccess: true,
    })
    if (!docs.length) throw new APIError('File not found.', 404)
  }
  return true
}

const create: Access = async ({ req, data }) => {
  const user = req.user
  if (!isSiteAdmin(user) && !isSubjectAdminForAny(user)) return false
  if (!data) return true // Payload asks without a record when drawing the Create button.
  const id = relId(data.lessonPlan)
  if (id === null) throw new APIError('Choose a sub-strand.', 400)
  const plan = await req.payload.findByID({
    collection: 'lesson-plans',
    id,
    depth: 0,
    req,
    disableErrors: true,
    overrideAccess: true,
  })
  if (!plan) throw new APIError('Sub-strand not found.', 404)
  return isSubjectAdminFor(user, toId(plan.subjectGrade))
}

const remove: Access = ({ req }) => {
  if (isSiteAdmin(req.user)) return true
  const grades = subjectGradeIdsByRole(req.user, ['subjectAdmin'])
  return grades.length > 0 && { 'lessonPlan.subjectGrade': { in: grades } }
}

export const SupportingFiles: CollectionConfig = {
  slug: 'supporting-files',
  labels: { singular: 'Supporting file', plural: 'Supporting files' },
  lockDocuments: false,
  disableDuplicate: true,
  endpoints: [importSupportingFilesEndpoint],
  admin: {
    group: 'Curriculum',
    useAsTitle: 'title',
    defaultColumns: ['title', 'lessonPlan', 'lessonNumber', 'kind'],
    hidden: ({ user }) => !isSiteAdmin(user as User) && !isSubjectAdminForAny(user as User),
  },
  upload: {
    staticDir: storageRoot,
    pasteURL: false,
    bulkUpload: false,
    crop: false,
    focalPoint: false,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
    modifyResponseHeaders: ({ headers }) => {
      headers.set('Cache-Control', 'private, no-store')
      headers.set('Content-Disposition', 'attachment')
      headers.set('X-Content-Type-Options', 'nosniff')
      return headers
    },
  },
  access: { read, create, update: () => false, delete: remove },
  hooks: {
    beforeOperation: [
      ({ args, operation, overrideAccess, req }) => {
        if ((operation === 'create' || operation === 'delete') && !overrideAccess && !req.user) {
          throw new APIError('Sign in to manage supporting files.', 401)
        }
        if (operation === 'create' && req.file) {
          // An immutable, unique disk name also lets the backup copy the exact files in its dump.
          const extension = extname(req.file.name).toLowerCase()
          req.file.name = randomUUID() + (/^\.[a-z0-9]+$/.test(extension) ? extension : '')
        }
        return args
      },
    ],
    beforeValidate: [
      async ({ data, operation, req }) => {
        if (operation !== 'create' || data?.lessonNumber == null) return data
        const planId = relId(data.lessonPlan)
        if (planId === null) return data
        const plan = await req.payload.findByID({
          collection: 'lesson-plans',
          id: planId,
          depth: 0,
          req,
        })
        const versionId = relId(plan.officialVersion)
        const version =
          versionId === null
            ? null
            : await req.payload.findByID({
                collection: 'lesson-bundle-versions',
                id: versionId,
                depth: 0,
                req,
              })
        const lessonNumber = Number(data.lessonNumber)
        if (!version?.lessons?.some((lesson) => lesson.number === lessonNumber)) {
          throw new APIError('Enter a lesson number from the current Official version.', 400)
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    {
      name: 'lessonPlan',
      label: 'Sub-strand',
      type: 'relationship',
      relationTo: 'lesson-plans',
      required: true,
      index: true,
      filterOptions: ({ req: { user } }) => {
        if (isSiteAdmin(user)) return true
        return { subjectGrade: { in: subjectGradeIdsByRole(user, ['subjectAdmin']) } }
      },
    },
    {
      name: 'lessonNumber',
      type: 'number',
      min: 1,
      admin: { description: 'Leave blank if the file is for the whole sub-strand.' },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [...SUPPORTING_FILE_KINDS],
    },
  ],
}
