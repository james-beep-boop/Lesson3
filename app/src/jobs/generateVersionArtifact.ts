/**
 * `generateVersionArtifact` task — the version-model counterpart to `generateArtifact`.
 *
 * Same async/throttled contract (a cold export ENQUEUES this and returns 202; the in-process
 * `autoRun` runner picks it up, bounded by the queue `limit`), but keyed on an immutable
 * `lesson-bundle-version` instead of a legacy bundle + lockVersion. Because a version never
 * changes, its cache scope (`version:<id>`) needs no cache-buster, so there is no stale-key
 * drift to reason about (unlike the bundle job). The job writes artifacts + manifest into the
 * cache; the status poll and warm path then serve them. Output carries nothing (bytes live only
 * in the cache, never the DB).
 *
 * TRUST: runs as a system path. Authorization (caller READ access) is enforced at ENQUEUE time
 * by the version export endpoint; the task itself uses overrideAccess.
 */
import type { TaskConfig } from 'payload'

import {
  produceArtifacts,
  safePrefix,
  versionScope,
  type ArtifactSpec,
} from '../generator/exportArtifacts'
import { generateForVersion } from '../generator/generateForVersion'
import { docxToPdf } from '../generator/docxToPdf'
import type { LessonBundleVersion } from '../payload-types'

export interface GenerateVersionArtifactInput {
  versionId: number
  format: 'standard' | 'compact'
  kind: 'docx' | 'pdf'
}

export const GENERATE_VERSION_ARTIFACT_SLUG = 'generateVersionArtifact' as const

export const generateVersionArtifactTask: TaskConfig<{
  input: GenerateVersionArtifactInput
  output: object
}> = {
  slug: GENERATE_VERSION_ARTIFACT_SLUG,
  retries: 0,
  inputSchema: [
    { name: 'versionId', type: 'number', required: true },
    { name: 'format', type: 'text', required: true },
    { name: 'kind', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const { versionId, format, kind } = input
    const spec: ArtifactSpec = { scope: versionScope(versionId), format, kind }
    // Generation and the prefix read are independent — run them concurrently.
    const [generated, version] = await Promise.all([
      generateForVersion(req.payload, versionId, format),
      req.payload.findByID({
        collection: 'lesson-bundle-versions',
        id: versionId,
        depth: 0,
        overrideAccess: true,
      }) as Promise<LessonBundleVersion>,
    ])
    await produceArtifacts(spec, generated, safePrefix(version.meta?.filePrefix), docxToPdf)
    return { output: {} }
  },
}
