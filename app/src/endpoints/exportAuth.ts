/**
 * Shared authorization + spec resolution for the export endpoints (SPEC §9).
 *
 * The export download (`/export`) and its status poll (`/export/status`) must apply the SAME
 * gate — caller READ access, then published-only — and derive the SAME `ArtifactSpec`, or the
 * two can drift (a job enqueued under one gate but status-checked under another). Centralising
 * it here makes that impossible: both handlers call `authorizeExportRequest` and get back the
 * readable, exportable bundle plus its artifact spec, or it throws the right APIError.
 */
import { APIError, type PayloadRequest } from 'payload'

import { assertExportable, NotExportableError } from '../generator/generateForBundle'
import { bundleScope, versionScope, type ArtifactSpec } from '../generator/exportArtifacts'
import { parseLessonSequenceFormat, parseExportKind } from './parseFormat'
import { findReadableBundle, findReadableVersion } from '../lib/readBundle'
import type { LessonBundle, LessonBundleVersion, User } from '../payload-types'

export async function authorizeExportRequest(
  req: PayloadRequest,
): Promise<{ bundle: LessonBundle; spec: ArtifactSpec }> {
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing bundle id', 400)

  const format = parseLessonSequenceFormat(req)
  const kind = parseExportKind(req)

  // Enforce the caller's READ access (a Teacher only matches published bundles), then
  // published-only — before any artifact is served, enqueued, or reported on.
  const bundle = await findReadableBundle(req.payload, { id, user: req.user as User, req })
  if (!bundle) throw new APIError('Bundle not found', 404)
  try {
    assertExportable(bundle)
  } catch (err) {
    if (err instanceof NotExportableError) throw new APIError(err.message, 409)
    throw err
  }

  return { bundle, spec: { scope: bundleScope(id, bundle.lockVersion), format, kind } }
}

/**
 * Version-model counterpart: authorize + resolve the export spec for a `lesson-bundle-version`.
 * Enforces the caller's READ access (not-visible → 404). There is NO published/exportable gate —
 * a retained version is immutable and already passed `enforceBundleVersionGeneratable` at create,
 * so it is inherently exportable. The cache scope is the immutable version id (no cache-buster).
 */
export async function authorizeVersionExportRequest(
  req: PayloadRequest,
): Promise<{ version: LessonBundleVersion; spec: ArtifactSpec }> {
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing version id', 400)

  const format = parseLessonSequenceFormat(req)
  const kind = parseExportKind(req)

  const version = await findReadableVersion(req.payload, { id, user: req.user as User, req })
  if (!version) throw new APIError('Version not found', 404)

  return { version, spec: { scope: versionScope(version.id), format, kind } }
}
