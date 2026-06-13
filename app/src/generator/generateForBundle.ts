/**
 * Generate the three CBE DOCX for a *stored* bundle, with the export validity gate.
 *
 * This is the single reusable core for every generation path (the `generate-bundle`
 * CLI now; a Payload custom endpoint for export/sharing later — SPEC §9). The validity
 * gate lives HERE, not in any one caller, so it is enforced by default regardless of
 * entry point. A future endpoint layers READ access on top; it does not re-implement
 * the gate.
 *
 * Validity gate (decided 2026-06-08, see docs/DECISIONS.md): generation is restricted
 * to PUBLISHED / official versions. Enabling drafts relaxes required-field validation,
 * so an invalid draft snapshot can exist — it must never be exported. Publishing a
 * bundle enforces required fields, so a published bundle is already schema-valid.
 */
import type { Payload } from 'payload'

import { bundleToAresData } from './adapter'
import { generateBundleDocx, type GeneratedDocx, type LessonSequenceFormat } from './index'
import type { LessonBundle } from '../payload-types'

/** Thrown when a bundle is not in an exportable (published/official) state. */
export class NotExportableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotExportableError'
  }
}

/** Reject anything that is not a published/official snapshot. */
export function assertExportable(bundle: Pick<LessonBundle, 'id' | '_status'>): void {
  if (bundle._status !== 'published') {
    throw new NotExportableError(
      `Bundle ${bundle.id} is not exportable: only published/official versions may be ` +
        `generated (status is "${bundle._status ?? 'draft'}").`,
    )
  }
}

/**
 * Load the published bundle by id, validate, and generate its three DOCX as Buffers.
 * Reads the published snapshot (no `draft: true`) so an in-progress draft never leaks
 * into an export.
 *
 * SECURITY — this fetch uses `overrideAccess: true`: it is a TRUSTED SYSTEM path (the
 * CLI / future batch jobs), NOT an authorization boundary. A future §9 export endpoint
 * MUST enforce the caller's READ access *before* calling this (e.g. find the bundle with
 * the request's `req`/`overrideAccess:false` first, then pass the id), or pass `req` so
 * access runs. Do not expose this function directly as an endpoint handler.
 */
export async function generateForBundle(
  payload: Payload,
  id: number | string,
  format: LessonSequenceFormat = 'standard',
): Promise<GeneratedDocx> {
  const bundle = (await payload.findByID({
    collection: 'lesson-bundles',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundle

  assertExportable(bundle)

  return generateBundleDocx(bundleToAresData(bundle), format)
}
