/**
 * Generate the three CBE DOCX for a stored lesson-plan VERSION (the Official-version model).
 *
 * A `lesson-bundle-version` is an immutable snapshot that already passed
 * `enforceBundleVersionGeneratable` at create time, so there is NO published/draft gate here: every
 * retained version is inherently valid to generate. Its content fields are exactly what the generator
 * adapter reads, so `bundleToAresData` (typed to `LessonBundleVersion`) consumes it directly — byte
 * fidelity proven by `scripts/adapter-fidelity.ts` + `scripts/roundtrip-regression.ts`.
 *
 * SECURITY — uses `overrideAccess: true`: a TRUSTED SYSTEM path (export job / server render), NOT an
 * authorization boundary. Callers MUST enforce the caller's READ access first (find with the
 * request's `user`/`overrideAccess:false`, then pass the id) — see `findReadableVersion`.
 */
import type { Payload } from 'payload'

import { bundleToAresData } from './adapter'
import { generateBundleDocx, type GeneratedDocx } from './index'
import type { LessonBundleVersion } from '../payload-types'

/**
 * Pure transform: an already-loaded version snapshot → generated DOCX. No fetch, no access check, no
 * delete-between-reads race — the CALLER owns the row (it loaded and, where relevant, null-gated it).
 * The two artifact jobs use this: they read the version once for their own gating and hand that exact
 * snapshot here, so generation can never re-read it and see it vanish.
 */
export function generateFromVersionSnapshot(version: LessonBundleVersion): Promise<GeneratedDocx> {
  return generateBundleDocx(bundleToAresData(version))
}

/**
 * id-based convenience for callers that hold only an id (e.g. `htmlSectionsCache`): fetch the version
 * on the trusted system path, then generate. See the module header for the `overrideAccess` contract —
 * the caller must have already enforced the request's read access.
 */
export async function generateForVersion(payload: Payload, id: number | string): Promise<GeneratedDocx> {
  const version = (await payload.findByID({
    collection: 'lesson-bundle-versions',
    id,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundleVersion

  return generateFromVersionSnapshot(version)
}
