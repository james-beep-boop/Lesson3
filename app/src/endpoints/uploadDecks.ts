import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  type Endpoint,
  type PayloadRequest,
} from 'payload'

import { canImportDecks, isSubjectAdminFor, toId } from '../access'
import { findDeckArt, readDeckArt } from '../decks/art'
import { readDeckUpload } from '../decks/importFiles'
import { storeDeckSpec } from '../decks/storage'
import { IngestError } from '../ingest/errors'
import { MAX_ZIP_BYTES } from '../ingest/uploadFiles'
import { relId } from '../lib/relId'
import { lockRows } from '../lib/txDb'
import { deckSeries } from '../lib/versionSeries'
import { assertDeclaredBodyWithin, json, refreshCaller } from './respond'

async function destination(req: PayloadRequest, id: number) {
  const plan = await req.payload.findByID({
    collection: 'lesson-plans',
    id,
    depth: 0,
    overrideAccess: false,
    disableErrors: true,
    req,
  })
  if (!plan) throw new APIError('Sub-strand not found.', 404)
  const subjectGrade = toId(plan.subjectGrade)
  if (subjectGrade == null || !isSubjectAdminFor(req.user, subjectGrade)) {
    throw new APIError('You can upload decks only for subjects and grades you administer.', 403)
  }
  return { subjectGrade, officialVersion: relId(plan.officialVersion) }
}

export const uploadDecksEndpoint: Endpoint = {
  path: '/upload',
  method: 'post',
  handler: async (req) => {
    if (!req.user) throw new APIError('Sign in to upload decks.', 401)
    if (!canImportDecks(req.user)) {
      throw new APIError('Only administrators can upload decks.', 403)
    }

    assertDeclaredBodyWithin(req, MAX_ZIP_BYTES + 256 * 1024, 'The upload is too large.')
    const form = await req.formData?.().catch(() => null)
    const lessonPlan = relId(form?.get('lessonPlan'))
    if (lessonPlan == null) throw new APIError('Choose a sub-strand.', 400)
    const { subjectGrade } = await destination(req, lessonPlan)

    const file = form?.get('file')
    if (!file || typeof file === 'string') throw new APIError('Choose a JSON or ZIP file.', 400)
    const lessonNumber = form?.get('lessonNumber')
    if (lessonNumber && relId(lessonNumber) == null) {
      throw new APIError('Enter a whole lesson number.', 400)
    }
    let input: Awaited<ReturnType<typeof readDeckUpload>>
    try {
      input = await readDeckUpload(file, relId(lessonNumber) ?? undefined)
    } catch (error) {
      if (error instanceof IngestError) throw new APIError(error.message, 400)
      throw error
    }

    const shouldCommit = await initTransaction(req)
    try {
      // Match the plan import lock order so first imports serialize, even before a deck exists.
      await lockRows(req, 'subject_grades', [subjectGrade])
      await lockRows(req, 'lesson_plans', [lessonPlan])
      await refreshCaller(req)
      const { officialVersion } = await destination(req, lessonPlan)
      const planVersion =
        officialVersion == null
          ? null
          : await req.payload.findByID({
              collection: 'lesson-bundle-versions',
              id: officialVersion,
              select: { meta: { substrand_id: true }, lessons: { number: true } },
              depth: 0,
              overrideAccess: true,
              disableErrors: true,
              req,
            })
      const substrandId = planVersion?.meta?.substrand_id?.trim()
      if (!substrandId) {
        throw new APIError('Choose a sub-strand with an Official plan and a sub-strand ID.', 400)
      }
      const lessonNumbers = new Set(planVersion?.lessons?.map(({ number }) => number))
      for (const spec of input.specs) {
        if (!lessonNumbers.has(spec.lessonNumber)) {
          throw new APIError(`Lesson ${spec.lessonNumber} is not in the selected sub-strand.`, 404)
        }
      }

      const results = []
      for (const spec of input.specs) {
        const { lessonNumber, fingerprint, title } = spec
        const { docs } = await req.payload.find({
          collection: deckSeries.parent,
          where: {
            and: [
              { subjectGrade: { equals: subjectGrade } },
              { substrandId: { equals: substrandId } },
              { lessonNumber: { equals: lessonNumber } },
            ],
          },
          depth: 0,
          limit: 1,
          overrideAccess: true,
          req,
        })

        const existing = docs[0]
        if (existing && relId(existing.lessonPlan) !== lessonPlan) {
          throw new APIError(
            'More than one plan uses this sub-strand ID. Choose the plan that already has the deck.',
            409,
          )
        }
        if (existing?.importFingerprint === fingerprint) {
          results.push({ id: existing.id, lessonNumber, status: 'already here' })
        } else {
          if (existing) {
            if (form?.get('replace') !== 'yes') {
              throw new APIError(
                'Select “Replace changed decks” and try again to remove the previous deck versions.',
                409,
              )
            }
            await req.payload.delete({
              collection: deckSeries.parent,
              id: existing.id,
              overrideAccess: true,
              req,
            })
          }
          const deck = await req.payload.create({
            collection: deckSeries.parent,
            data: {
              lessonPlan,
              subjectGrade,
              substrandId,
              lessonNumber,
              title,
              importFingerprint: fingerprint,
            },
            overrideAccess: true,
            req,
          })
          const version = await req.payload.create({
            collection: deckSeries.versions,
            data: {
              deck: deck.id,
              subjectGrade,
              semver: '1.0.0',
              spec: storeDeckSpec(spec.raw),
            } as never,
            overrideAccess: true,
            req,
          })
          await req.payload.update({
            collection: deckSeries.parent,
            id: deck.id,
            data: { officialVersion: version.id },
            overrideAccess: true,
            req,
          })
          results.push({
            id: deck.id,
            lessonNumber,
            status: existing ? 'replaced' : 'imported',
            semver: version.semver,
          })
        }
      }

      for (const spec of input.specs) {
        const { lessonNumber } = spec
        for (const artId of spec.artIds) {
          const art = input.art.get(artId)
          if (!art) continue
          const previous = await findDeckArt(req, lessonPlan, lessonNumber, artId)
          const previousBytes = previous?.filename
            ? await readDeckArt(req, previous.filename)
            : null
          if (previousBytes?.equals(art.data)) continue
          await req.payload.create({
            collection: 'supporting-files',
            data: { lessonPlan, lessonNumber, title: artId, kind: 'deck-art' },
            file: { ...art },
            overrideAccess: true,
            req,
          })
        }
      }
      if (!isSubjectAdminFor(await refreshCaller(req), subjectGrade)) {
        throw new APIError('You can upload decks only for subjects and grades you administer.', 403)
      }
      if (shouldCommit) await commitTransaction(req)
      return json({ decks: results })
    } catch (error) {
      await killTransaction(req)
      throw error
    }
  },
}
