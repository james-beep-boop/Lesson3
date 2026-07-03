/**
 * Shared authorization + spec resolution for the version export endpoints (SPEC §9).
 *
 * The export download (`/export`), its prepare (POST), and its status poll (`/export/status`) must
 * apply the SAME gate — caller READ access — and derive the SAME `ArtifactSpec`, or the three can
 * drift (a job enqueued under one gate but status-checked under another). Centralising it here makes
 * that impossible: every handler calls `authorizeVersionExportRequest` and gets back the readable
 * version plus its artifact spec, or it throws the right APIError.
 */
import { APIError, type PayloadRequest } from 'payload'

import { versionScope, type ArtifactSpec } from '../generator/exportArtifacts'
import { parseExportKind } from './parseFormat'
import { findReadableVersion } from '../lib/readBundle'
import type { LessonBundleVersion, User } from '../payload-types'

/**
 * Authorize + resolve the export spec for a `lesson-bundle-version` (SPEC §9, Official-version model).
 * Enforces the caller's READ access (not-visible → 404). There is NO published/exportable gate —
 * a retained version is immutable and already passed `enforceBundleVersionGeneratable` at create,
 * so it is inherently exportable. The cache scope is the immutable version id (no cache-buster).
 */
export async function authorizeVersionExportRequest(
  req: PayloadRequest,
): Promise<{ version: LessonBundleVersion; spec: ArtifactSpec }> {
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing version id', 400)

  const kind = parseExportKind(req)

  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)

  return { version, spec: { scope: versionScope(version.id), kind } }
}
