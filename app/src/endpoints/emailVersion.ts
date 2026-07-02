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
import { enforceSharedRateLimit, enforceUserRateLimit } from '../lib/rateLimit'
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

    // Abuse controls above the per-user cap (Codex audit 2026-07-02): one address may only receive
    // so much from us per day (shared across senders), and the site has a global daily ceiling —
    // many accounts (or a compromised account farm) can't turn us into a mail cannon. Keyed by the
    // lowercased recipient so case games don't mint fresh budgets.
    const recipientLimited = await enforceSharedRateLimit(
      req,
      'emailRecipient',
      to.toLowerCase(),
      'This recipient has reached their daily email limit — please try again tomorrow.',
    )
    if (recipientLimited) return recipientLimited
    const globalLimited = await enforceSharedRateLimit(
      req,
      'emailGlobal',
      'all',
      'The site-wide daily email limit has been reached — please try again tomorrow.',
    )
    if (globalLimited) return globalLimited

    const { version, spec } = await authorizeVersionExportRequest(req)

    const user = req.user as User
    const input: EmailVersionArtifactInput = {
      versionId: Number(version.id),
      format: spec.format,
      kind: spec.kind,
      to,
      // Durable audit trail (Codex audit 2026-07-02): the ID is the stable attribution for this
      // data-egress path (names are neither stable nor unique); both live on the retained
      // payload-jobs row and in the task's structured logs.
      requestedByUserId: user.id,
      requestedByName: user.name ?? 'A colleague',
    }
    await req.payload.jobs.queue({ task: EMAIL_VERSION_ARTIFACT_SLUG, input, req })

    return json({ state: 'queued', to }, 202)
  },
}
