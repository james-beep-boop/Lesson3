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

export async function generateForVersion(
  payload: Payload,
  id: number | string,
  // A caller that already loaded the row (e.g. the `generateVersionArtifact` task's vanished-version
  // gate) passes it here so generation reuses that exact snapshot instead of issuing a second read —
  // closing the delete-between-reads race where the gate saw the version but this findByID would then
  // throw a raw NotFound. When omitted, the `depth: 0` / `overrideAccess: true` read is authoritative.
  preloaded?: LessonBundleVersion,
): Promise<GeneratedDocx> {
  const version =
    preloaded ??
    ((await payload.findByID({
      collection: 'lesson-bundle-versions',
      id,
      depth: 0,
      overrideAccess: true,
    })) as LessonBundleVersion)

  return generateBundleDocx(bundleToAresData(version))
}
