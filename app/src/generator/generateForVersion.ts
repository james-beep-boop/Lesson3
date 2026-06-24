/**
 * Generate the three CBE DOCX for a stored lesson-bundle VERSION (the Official-version model).
 *
 * The version-model counterpart to `generateForBundle`. A `lesson-bundle-version` is an immutable
 * snapshot that already passed `enforceBundleVersionGeneratable` at create time, so there is NO
 * published/draft gate here (unlike the legacy bundle path): every retained version is inherently
 * valid to generate. Its content fields are the same shape the generator adapter reads (the version
 * collection reuses the bundle content fields), so `bundleToAresData` consumes it unchanged — proven
 * byte-identical by `scripts/verify-migration.ts`.
 *
 * SECURITY — uses `overrideAccess: true`: a TRUSTED SYSTEM path (export job / server render), NOT an
 * authorization boundary. Callers MUST enforce the caller's READ access first (find with the
 * request's `user`/`overrideAccess:false`, then pass the id) — see `findReadableVersion`.
 */
import type { Payload } from 'payload'

import { bundleToAresData } from './adapter'
import { generateBundleDocx, type GeneratedDocx, type LessonSequenceFormat } from './index'
import type { LessonBundle, LessonBundleVersion } from '../payload-types'

export async function generateForVersion(
  payload: Payload,
  id: number | string,
  format: LessonSequenceFormat = 'standard',
): Promise<GeneratedDocx> {
  const version = (await payload.findByID({
    collection: 'lesson-bundle-versions',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundleVersion

  // The version carries the same content fields the adapter reads; cast across the sibling types.
  return generateBundleDocx(bundleToAresData(version as unknown as LessonBundle), format)
}
