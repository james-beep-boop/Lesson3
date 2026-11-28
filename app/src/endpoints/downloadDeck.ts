import { APIError, type Endpoint } from 'payload'
import sharp from 'sharp'

import { buildDeck } from '../decks'
import { findDeckArt, readDeckArt } from '../decks/art'
import { DECK_RENDER_VERSION } from '../decks/renderVersion'
import { deckArtIds } from '../decks/spec'
import { readDeckSpec } from '../decks/storage'
import { bundleToAresData } from '../generator/adapter'
import {
  artifactKey,
  bestEffortArtifact,
  getArtifact,
  putArtifact,
} from '../generator/artifactCache'
import { PdfConversionError, PPTX_MIME, pptxToPdf } from '../generator/docxToPdf'
import { mimeFor, safePrefix } from '../generator/exportArtifacts'
import { isObject } from '../ingest/resourceLinks'
import { runWithConversionSlot } from '../lib/conversionLimit'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { findReadablePlan, findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'

export const downloadDeckEndpoint: Endpoint = {
  path: '/:id/download',
  method: 'get',
  handler: async (req) => {
    const { payload, user } = req
    if (!user) throw new APIError('Sign in to download slides.', 401)
    const id = relId(req.routeParams?.id)
    if (!id) throw new APIError('Slides not found.', 404)
    const kind = req.query?.as ?? 'pptx'
    const requestedVersion = relId(req.query?.planVersion)
    if (kind !== 'pptx' && kind !== 'pdf') {
      throw new APIError('Choose slides in PowerPoint or PDF format.', 400)
    }
    if (req.query?.planVersion !== undefined && !requestedVersion) {
      throw new APIError('Choose a lesson plan version.', 400)
    }

    const deck = await payload.findByID({
      collection: 'decks',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      req,
    })
    const deckVersionId = relId(deck?.officialVersion)
    const planId = relId(deck?.lessonPlan)
    if (!deck || !deckVersionId || !planId) throw new APIError('Slides not found.', 404)

    const plan = await findReadablePlan(payload, { id: planId, req, user })
    const planVersionId = requestedVersion ?? relId(plan?.officialVersion)
    if (!plan || !planVersionId) throw new APIError('Lesson plan not found.', 404)

    const [version, planVersion] = await Promise.all([
      payload.findByID({
        collection: 'deck-versions',
        id: deckVersionId,
        depth: 0,
        overrideAccess: false,
        disableErrors: true,
        req,
      }),
      findReadableVersion(payload, { id: planVersionId, req, user }),
    ])
    if (!version || relId(version.deck) !== deck.id) {
      throw new APIError('Slides not found.', 404)
    }
    if (
      !planVersion ||
      relId(planVersion.lessonPlan) !== planId ||
      planVersion.meta?.substrand_id?.trim() !== deck.substrandId ||
      !planVersion.lessons?.some(({ number }) => number === deck.lessonNumber)
    ) {
      throw new APIError('This lesson is missing from that lesson plan version.', 404)
    }

    const spec = readDeckSpec(version.spec)
    if (!isObject(spec)) throw new APIError('Could not read these slides.', 500)
    const pictures = await Promise.all(
      [...deckArtIds(spec)].filter(Boolean).map(async (artId) => ({
        artId,
        file: await findDeckArt(req, planId, deck.lessonNumber, artId),
      })),
    )
    // The plan supplies lesson resources and unit context. Pictures can be updated separately
    // from the deck. Both are render inputs and must invalidate cached output when they change.
    const artIds = pictures.map(({ file }) => file?.id ?? 0).join(',')
    const scope = `deck-render:${DECK_RENDER_VERSION}:deck-version:${version.id}:plan-version:${planVersionId}:art:${artIds}`
    const pptxKey = artifactKey({ scope, kind: 'pptx', doc: 'slides' })
    const key = kind === 'pdf' ? artifactKey({ scope, kind, doc: 'slides' }) : pptxKey
    const readCache = (key: string) =>
      bestEffortArtifact(payload.logger, 'read', () => getArtifact(key), null)
    const writeCache = (key: string, bytes: Buffer) =>
      bestEffortArtifact(payload.logger, 'write', () => putArtifact(key, bytes), undefined)

    const cached = await readCache(key)
    let bytes = cached
    if (!bytes) {
      const limited = await enforceUserRateLimit(req, 'export')
      if (limited) return limited
      try {
        bytes = await runWithConversionSlot(async () => {
          let pptx = kind === 'pdf' ? await readCache(pptxKey) : null
          if (!pptx) {
            const art = new Map<string, Buffer>()
            for (const { artId, file } of pictures) {
              if (!file) continue
              const picture = file.filename ? await readDeckArt(req, file.filename) : null
              if (!picture) throw new Error(`Deck picture ${file.id} is missing from storage`)
              art.set(
                artId,
                file.mimeType === 'image/png' ? picture : await sharp(picture).png().toBuffer(),
              )
            }
            pptx = await buildDeck(spec, bundleToAresData(planVersion), deck.lessonNumber, art)
            await writeCache(pptxKey, pptx)
          }
          if (kind === 'pptx') return pptx
          const pdf = await pptxToPdf(pptx)
          await writeCache(key, pdf)
          return pdf
        })
      } catch (err) {
        payload.logger.error(
          { err, deckId: id, versionId: version.id, kind },
          'Slide download failed',
        )
        if (err instanceof PdfConversionError) {
          throw new APIError('Could not make a PDF of these slides. Try again.', 502)
        }
        throw new APIError('Could not prepare these slides.', 500)
      }
    }
    if (!bytes) throw new APIError('Slide downloads are busy. Try again in a moment.', 503)

    const prefix = safePrefix(planVersion.meta?.filePrefix)
    const filename = `${prefix}_L${deck.lessonNumber}_Slides.${kind}`
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': kind === 'pptx' ? PPTX_MIME : mimeFor(kind),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.length),
        'X-Artifact-Cache': cached ? 'HIT' : 'MISS',
      },
    })
  },
}
