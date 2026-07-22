/**
 * `emailVersionArtifact` task (SPEC §10 email-a-doc) — generate a version's export zip (or reuse
 * the artifact cache) and send it as an email attachment via the configured nodemailer adapter.
 *
 * Rides the same seams as `generateVersionArtifact`: the artifact cache is content-addressed by the
 * immutable version scope, so an emailed document and a downloaded one are byte-identical, and a
 * warm cache makes the email nearly free. The endpoint validated the recipient and enforced the
 * daily per-user email cap at ENQUEUE time; like the export task, this runs as a trusted system
 * path (overrideAccess) — authorization (caller READ access) was the endpoint's job.
 *
 * Failure model: `retries: 0` — a failed send stays failed (logged with context + retained on the
 * payload-jobs row for Site-Admin visibility). The 202 contract is "queued", not "delivered";
 * SMTP-level bounces after a successful handoff are out of scope (SPEC §10/§11).
 */
import type { TaskConfig } from 'payload'

import {
  assertExportKind,
  loadCachedExportZip,
  produceArtifacts,
  safePrefix,
  versionScope,
  type ArtifactSpec,
  type ExportKind,
} from '../generator/exportArtifacts'
import { generateFromVersionSnapshot } from '../generator/generateForVersion'
import { docxToPdf } from '../generator/docxToPdf'
import { sanitizeEmailHeaderText } from '../lib/emailAddress'
import { captureException } from '../lib/errorTracking'
import type { LessonBundleVersion } from '../payload-types'

export interface EmailVersionArtifactInput {
  versionId: number
  kind: ExportKind
  /** Validated recipient address (parseRecipientEmail ran at enqueue). */
  to: string
  /** Requesting user's id — the durable audit anchor for this data-egress path (Codex audit
   *  2026-07-02): retained on the payload-jobs row and carried in both outcome logs. */
  requestedByUserId: number
  /** Display name of the requesting user, captured at enqueue for the attribution line. */
  requestedByName: string
}

export const EMAIL_VERSION_ARTIFACT_SLUG = 'emailVersionArtifact' as const

export const emailVersionArtifactTask: TaskConfig<{
  input: EmailVersionArtifactInput
  output: object
}> = {
  slug: EMAIL_VERSION_ARTIFACT_SLUG,
  retries: 0,
  inputSchema: [
    { name: 'versionId', type: 'number', required: true },
    { name: 'kind', type: 'text', required: true },
    { name: 'to', type: 'text', required: true },
    { name: 'requestedByUserId', type: 'number', required: true },
    { name: 'requestedByName', type: 'text', required: true },
  ],
  handler: async ({ input, req }) => {
    const { versionId, kind, to, requestedByUserId, requestedByName } = input
    try {
      assertExportKind(kind) // the inputSchema is `text` — reject a bad row before any cache write
      const spec: ArtifactSpec = { scope: versionScope(versionId), kind }

      // `version` (needed for the email body/filename regardless of cache state) and a first cache
      // read are independent — run them concurrently, same as generateVersionArtifact's Promise.all
      // of generation + the prefix read.
      const [version, cached] = await Promise.all([
        req.payload.findByID({
          collection: 'lesson-bundle-versions',
          id: versionId,
          depth: 0,
          overrideAccess: true,
        }) as Promise<LessonBundleVersion>,
        loadCachedExportZip(spec),
      ])
      const prefix = safePrefix(version.meta?.filePrefix)

      // Warm the cache exactly like an export would; a prior export/email of this spec makes the
      // cache read above already a hit. The zip MUST resolve afterwards — a null here is a real
      // fault, not a race.
      let zip = cached
      if (!zip) {
        // Reuse the `version` already loaded above rather than re-reading the row inside the generator.
        await produceArtifacts(spec, await generateFromVersionSnapshot(version), prefix, docxToPdf)
        zip = await loadCachedExportZip(spec)
      }
      if (!zip) throw new Error('export artifacts missing after generation')

      const filename = `${prefix}_${kind}.zip`
      // The stored title is admin-edited content headed into the Subject HEADER — strip control
      // characters (CR/LF) so it can never carry header-shaped bytes (audit 2026-07-04).
      const title = sanitizeEmailHeaderText(version.title) || 'Lesson plan'
      await req.payload.sendEmail({
        to,
        subject: `Lesson plan: ${title}`,
        text:
          `${requestedByName} sent you a lesson plan from ARES Lesson Plans.\n\n` +
          `${title}\nVersion ${version.semver ?? ''} (${kind.toUpperCase()})\n\n` +
          `The generated documents are attached as ${filename}.`,
        attachments: [{ filename, content: zip }],
      })
      req.payload.logger.info(
        { versionId, to, kind, requestedByUserId },
        'emailVersionArtifact sent',
      )
      return { output: {} }
    } catch (err) {
      // Same posture as generateVersionArtifact: structured log WITH context, rethrow so the job is
      // marked failed (visible on the payload-jobs row; retries: 0 keeps a failed send failed).
      req.payload.logger.error(
        { err, versionId, to, kind, requestedByUserId },
        'emailVersionArtifact failed',
      )
      // Tracker context deliberately omits `to` (an email address — the log stream keeps it).
      captureException(err, { job: 'emailVersionArtifact', versionId, kind, requestedByUserId })
      throw err
    }
  },
}
