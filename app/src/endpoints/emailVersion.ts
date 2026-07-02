/**
 * Email-a-doc endpoint (SPEC §10) — send a version's export zip to any address, server-side.
 *
 *   POST /api/lesson-bundle-versions/:id/email   body: { to: string }
 *   Query: `?format=standard|compact` · `?as=docx|pdf` — the same axes (and parser) as export.
 *
 * Same READ gate + spec resolution as export (`authorizeVersionExportRequest`); the send itself is
 * async — the endpoint validates + enqueues `emailVersionArtifact` and returns 202 {queued}. The
 * contract is "queued", not "delivered" (failures are logged + retained on the payload-jobs row).
 *
 * Guardrails, since this makes our server originate mail to arbitrary recipients on a user's
 * behalf: the 'email' rate bucket is a strict per-user DAILY cap (checked FIRST, so invalid
 * requests spend budget too — probing is not free); the recipient must parse as a single plausible
 * address (no CR/LF → no header smuggling); the body template names the requesting user, so every
 * outbound mail is attributable. Deliberately NO dedupe (unlike export-prepare): sending the same
 * document twice is a legitimate intent, and the daily cap bounds the volume.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { json } from './respond'
import { authorizeVersionExportRequest } from './exportAuth'
import { enforceUserRateLimit } from '../lib/rateLimit'
import { parseRecipientEmail } from '../lib/emailAddress'
import {
  EMAIL_VERSION_ARTIFACT_SLUG,
  type EmailVersionArtifactInput,
} from '../jobs/emailVersionArtifact'
import type { User } from '../payload-types'

export const emailVersionEndpoint: Endpoint = {
  path: '/:id/email',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)

    const limited = await enforceUserRateLimit(req, 'email')
    if (limited) return limited

    const body = (typeof req.json === 'function' ? await req.json().catch(() => null) : null) as {
      to?: unknown
    } | null
    const to = parseRecipientEmail(body?.to)
    if (!to) throw new APIError('A valid recipient email address ("to") is required.', 400)

    const { version, spec } = await authorizeVersionExportRequest(req)

    const input: EmailVersionArtifactInput = {
      versionId: Number(version.id),
      format: spec.format,
      kind: spec.kind,
      to,
      requestedByName: (req.user as User).name ?? 'A colleague',
    }
    await req.payload.jobs.queue({ task: EMAIL_VERSION_ARTIFACT_SLUG, input, req })

    return json({ state: 'queued', to }, 202)
  },
}
