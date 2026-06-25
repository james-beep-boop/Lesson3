/**
 * `generateArtifact` task (SPEC §9; readiness #1) — the async, throttled path for heavy
 * export generation. Producing a bundle's DOCX and (especially) converting to PDF via the
 * Gotenberg sidecar can take seconds; doing it on the request thread ties up an app worker.
 * So a cold export ENQUEUES this task and returns 202; the in-process `autoRun` runner (see
 * payload.config.ts) picks it up, bounded by the queue `limit` (the global concurrency cap on
 * heavy conversions). The task writes the artifacts + manifest into the cache; the status poll
 * and the warm export path then serve them. The job output carries nothing — bytes live only
 * in the cache, never in the DB (the `output` json field would otherwise bloat with binaries).
 *
 * TRUST: this runs as a system path. Authorization (caller READ access + published-only) was
 * enforced at ENQUEUE time by the export endpoint; the task itself uses overrideAccess. Do not
 * enqueue it from anywhere that hasn't already gated the caller.
 */
import type { TaskConfig } from 'payload'

import { bundleScope, produceArtifacts, safePrefix, type ArtifactSpec } from '../generator/exportArtifacts'
import { generateForBundle } from '../generator/generateForBundle'
import { docxToPdf } from '../generator/docxToPdf'
import type { LessonBundle } from '../payload-types'

export interface GenerateArtifactInput {
  bundleId: number
  /** Enqueue-time published lockVersion — pins the cache identity (see exportArtifacts). */
  lockVersion: number
  format: 'standard' | 'compact'
  kind: 'docx' | 'pdf'
}

export const GENERATE_ARTIFACT_SLUG = 'generateArtifact' as const

// Typed by its input/output SHAPE rather than a slug: the slug-keyed `TaskConfig` form needs
// the task registered in the generated `TypedJobs` map, which only exists after `generate:types`
// runs on the Rock. The I/O form keeps this strongly typed and compiling before that.
export const generateArtifactTask: TaskConfig<{ input: GenerateArtifactInput; output: object }> = {
  slug: GENERATE_ARTIFACT_SLUG,
  // No retries by default: a failure (e.g. Gotenberg down) marks the job hasError, which the
  // status poll surfaces to the client as an error rather than retrying a likely-still-down
  // sidecar. Retry policy can be revisited once the converter's failure modes are characterised.
  retries: 0,
  inputSchema: [
    { name: 'bundleId', type: 'number', required: true },
    { name: 'lockVersion', type: 'number', required: true },
    { name: 'format', type: 'text', required: true },
    { name: 'kind', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const { bundleId, lockVersion, format, kind } = input
    const spec: ArtifactSpec = { scope: bundleScope(bundleId, lockVersion), format, kind }
    // Generation and the prefix read are independent — run them concurrently.
    const [generated, bundle] = await Promise.all([
      generateForBundle(req.payload, bundleId, format),
      req.payload.findByID({
        collection: 'lesson-bundles',
        id: bundleId,
        depth: 0,
        overrideAccess: true,
      }) as Promise<LessonBundle>,
    ])
    await produceArtifacts(spec, generated, safePrefix(bundle.meta?.filePrefix), docxToPdf)
    return { output: {} }
  },
}
