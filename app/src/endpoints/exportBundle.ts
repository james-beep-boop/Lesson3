/**
 * Export endpoint (SPEC §9) — download a bundle's three DOCX as one .zip.
 *
 * Mounted on the lesson-bundles collection → `GET /api/lesson-bundles/:id/export`.
 * Query: `?format=standard|compact` (default `standard`). `compact` drops Section C's
 * Resource column and re-balances widths (see src/generator/buildSowCompact.js); it
 * only affects the LessonSequence — FinalExplanation/SummaryTable are identical.
 *
 * SECURITY: this is the authorization boundary that `generateForBundle` deliberately
 * is NOT (it fetches with overrideAccess:true as a trusted system path). We FIRST
 * re-read the bundle with the caller's own access (`overrideAccess:false` + `user`),
 * so the read rules apply — a Teacher can export only published bundles, an Editor only
 * within their subject-grades, etc. Only then do we generate. Published-only is enforced
 * again inside generateForBundle (NotExportableError → 409).
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'
import { createRequire } from 'node:module'

import { generateForBundle, NotExportableError } from '../generator/generateForBundle'
import { docxToPdf, PdfConversionError } from '../generator/docxToPdf'
import { parseLessonSequenceFormat } from './parseFormat'
import { findReadableBundle } from '../lib/readBundle'
import type { User } from '../payload-types'

const require = createRequire(import.meta.url)
const JSZip = require('jszip') as new () => {
  file(name: string, data: Buffer): void
  generateAsync(opts: { type: 'nodebuffer' }): Promise<Buffer>
}

/** Strip a stored filePrefix down to a safe bare filename component (no path/traversal). */
const safePrefix = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '').replace(/[^A-Za-z0-9._-]/g, '_') || 'bundle'

/** `?as=docx|pdf` (default `docx`). PDF runs each DOCX through the docxToPdf seam. */
const parseExportKind = (req: PayloadRequest): 'docx' | 'pdf' => {
  const as = new URL(req.url ?? '', 'http://localhost').searchParams.get('as')
  if (as !== null && as !== 'docx' && as !== 'pdf') {
    throw new APIError(`Invalid as "${as}" — expected docx|pdf`, 400)
  }
  return as === 'pdf' ? 'pdf' : 'docx'
}

export const exportBundleEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const id = req.routeParams?.id as string | undefined
    if (!id) throw new APIError('Missing bundle id', 400)

    const format = parseLessonSequenceFormat(req)
    const kind = parseExportKind(req)

    // Authorization: enforce the caller's READ access before generating. A non-readable /
    // unpublished bundle is "not found" for this user (null); a real DB/runtime error propagates.
    const bundle = await findReadableBundle(req.payload, { id, user: req.user as User, req })
    if (!bundle) throw new APIError('Bundle not found', 404)

    let docx
    try {
      docx = await generateForBundle(req.payload, id, format)
    } catch (err) {
      if (err instanceof NotExportableError) throw new APIError(err.message, 409)
      throw err
    }

    const prefix = safePrefix(bundle.meta?.filePrefix)

    // The up-to-three deliverables, in document order. FE/ST are null for some sub-strands.
    const docs: { name: string; docx: Buffer }[] = [
      { name: `${prefix}_CBE_LessonSequence`, docx: docx.lessonSequence },
    ]
    if (docx.finalExplanation) docs.push({ name: `${prefix}_FinalExplanation`, docx: docx.finalExplanation })
    if (docx.summaryTable) docs.push({ name: `${prefix}_SummaryTable`, docx: docx.summaryTable })

    const ext = kind === 'pdf' ? 'pdf' : 'docx'
    const zip = new JSZip()
    for (const d of docs) {
      try {
        const bytes = kind === 'pdf' ? await docxToPdf(d.docx, `${d.name}.docx`) : d.docx
        zip.file(`${d.name}.${ext}`, bytes)
      } catch (err) {
        // The converter being down is an upstream/service failure, not a client error.
        if (err instanceof PdfConversionError) throw new APIError(err.message, 502)
        throw err
      }
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${prefix}_${format}_${ext}.zip"`,
        'Content-Length': String(buf.length),
      },
    })
  },
}
