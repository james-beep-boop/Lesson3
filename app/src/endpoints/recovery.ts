/**
 * Edit-recovery endpoints — five route paths, SIX operations (design §2), mounted on
 * `lesson-bundle-versions` beside `/:id/preview` and `/:id/save-as-new`.
 *
 * | # | Method + path                        | Who         | unauth | wrong role |
 * |---|--------------------------------------|-------------|--------|------------|
 * | 1 | `POST   /:id/recovery/start`         | Editor      | 401    | 404        |
 * | 2 | `POST   /:id/recovery`   (capture)   | Editor      | 401    | 404        |
 * | 3 | `GET    /:id/recovery`               | Editor      | 401    | 404        |
 * | 4 | `DELETE /:id/recovery`   (discard)   | Editor      | 401    | 404        |
 * | 5 | `GET    /:id/recovery/meta`          | Site Admin  | 401    | 403        |
 * | 6 | `POST   /:id/recovery/meta/cleanup`  | Site Admin  | 401    | 403        |
 *
 * **404 vs 403 is deliberate.** Ops 1-4 give a non-editor 404, matching `previewVersion`: a 403 would
 * confirm the version exists to someone with no read access to it. Ops 5-6 give 403 — the caller is a
 * known user being told they are not an administrator, and the version's existence is not the secret.
 *
 * ⚑ **Ops 1-4 key on `req.user.id`, never on a body field.** A caller cannot start, capture into, read
 * or discard another user's capture by naming them, because there is nowhere to name them. That is
 * SPEC §13's cross-user guarantee (matrix case 5: a different user on the same browser sees nothing)
 * made structural rather than checked. Op 6 does take a `userId` — it is the one operation that acts
 * on someone else's row, which is exactly why it is Site-Admin-only and carries a revision from op 5.
 *
 * ⚑ **`lessonPlan`, `baseUpdatedAt` and `schemaVersion` are derived HERE from the authorized source**,
 * never accepted from the client. A client-supplied `baseUpdatedAt` would defeat the staleness guard
 * by asserting the source had not moved; `schemaVersion` would defeat the shape guard identically; a
 * client-supplied `lessonPlan` would file the row under a plan the caller may hold no rights to.
 *
 * Each operation re-loads the source and re-authorizes on every call, then the kernel writes with
 * `overrideAccess` — the pattern CLAUDE.md notes is only as safe as the tests that prove the gate runs
 * first, which is why every operation here owns wire-level 401/403/404 coverage in `tests/http`.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isEditorFor, isSiteAdmin, toId } from '../access'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import { enforceUserRateLimit } from '../lib/rateLimit'
import {
  capture,
  readActiveCapture,
  readCaptureMetadata,
  retire,
  start,
} from '../lib/editRecovery/kernel'
import type { LessonBundleVersion, User } from '../payload-types'

/** The schema shape a capture was taken under. Bumped when the prose field set changes. */
export const CAPTURE_SCHEMA_VERSION = 'v1'

const versionId = (req: PayloadRequest): string => {
  const id = req.routeParams?.id as string | undefined
  if (!id) throw new APIError('Missing version id', 400)
  return id
}

/**
 * Read-gate the version, then require EDIT rights on its subject-grade. A non-editor gets the same
 * 404 as a caller who cannot read it at all — see the note on 404 vs 403 above.
 */
async function loadEditable(req: PayloadRequest): Promise<LessonBundleVersion> {
  if (!req.user) throw new APIError('Unauthorized', 401)
  const version = await findReadableVersion(req.payload, {
    id: versionId(req),
    user: req.user as User,
    req,
  })
  if (!version) throw new APIError('Version not found', 404)
  if (!isEditorFor(req.user as User, toId(version.subjectGrade))) {
    throw new APIError('Version not found', 404)
  }
  return version
}

/** Site-Admin gate for ops 5 and 6. */
async function loadForAdmin(req: PayloadRequest): Promise<LessonBundleVersion> {
  if (!req.user) throw new APIError('Unauthorized', 401)
  if (!isSiteAdmin(req.user as User)) {
    throw new APIError('Only a site administrator may view recovery metadata.', 403)
  }
  const version = await findReadableVersion(req.payload, {
    id: versionId(req),
    user: req.user as User,
    req,
  })
  if (!version) throw new APIError('Version not found', 404)
  return version
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  try {
    return ((await req.json?.()) ?? {}) as Record<string, unknown>
  } catch {
    throw new APIError('Invalid JSON body', 400)
  }
}

/** A token field the client echoes back. Rejected rather than coerced — see `toPositiveInt`. */
function requireCounter(value: unknown, name: string): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new APIError(`\`${name}\` must be a positive integer`, 400)
  }
  return n
}

/**
 * The capture body's `document`, which must be a PLAIN OBJECT.
 *
 * ⚑ Without this, a missing / null / string / array `document` projected to `{}` and the capture
 * SUCCEEDED — advancing the revision and replacing a good backup with an empty one. A client defect
 * holding a valid token could therefore erase the very work this feature exists to protect, and
 * report success while doing it. An empty OBJECT is still legitimate (a teacher who cleared every
 * field); "no document at all" is not, and is now a 400.
 */
function requireDocument(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new APIError('`document` must be an object', 400)
  }
  return value as Record<string, unknown>
}

/**
 * The version's plan id. Required on the collection, so a null here means a populated relationship
 * arrived in a shape this could not read — worth failing loudly rather than filing the capture under
 * a null plan, which would break the admin metadata and cleanup scoping silently.
 */
function requirePlanId(version: LessonBundleVersion): number {
  const id = relId(version.lessonPlan)
  if (id === null) throw new APIError('Version has no lesson plan', 500)
  return id
}

/** 1. Explicit session start — the ONLY insert/reactivate path. */
export const recoveryStartEndpoint: Endpoint = {
  path: '/:id/recovery/start',
  method: 'post',
  handler: async (req) => {
    const version = await loadEditable(req)
    const limited = await enforceUserRateLimit(req, 'recovery')
    if (limited) return limited

    const result = await start(req, {
      userId: (req.user as User).id,
      sourceVersionId: version.id,
      // Derived from the AUTHORIZED source, never from the caller. `relId` rather than `toId`: the
      // latter is typed to the SubjectGrade ref and would need an `as never` cast here, which is the
      // ~30-site papercut CHANGELOG 2026-08-03 records as needing its own change. `relId` is the
      // general one and needs no cast.
      lessonPlanId: requirePlanId(version),
      sourceUpdatedAt: new Date(String(version.updatedAt)).toISOString(),
      schemaVersion: CAPTURE_SCHEMA_VERSION,
    })
    if (!result.ok) {
      return json(
        {
          errors: [
            {
              message:
                'You have too many lesson plans open with unsaved changes. Save or discard one, then try again.',
            },
          ],
          reason: result.reason,
        },
        409,
      )
    }
    return json({ token: result.token })
  },
}

/** 2. Capture — a CAS update of an existing ACTIVE row. Never an insert. */
export const recoveryCaptureEndpoint: Endpoint = {
  path: '/:id/recovery',
  method: 'post',
  handler: async (req) => {
    const version = await loadEditable(req)
    const limited = await enforceUserRateLimit(req, 'recovery')
    if (limited) return limited

    const payload = await body(req)
    const result = await capture(req, {
      userId: (req.user as User).id,
      sourceVersionId: version.id,
      generation: requireCounter(payload.generation, 'generation'),
      expectedRevision: requireCounter(payload.expectedRevision, 'expectedRevision'),
      // The RAW form document; the kernel projects it, so the prose whitelist cannot be bypassed here.
      formDocument: requireDocument(payload.document),
    })

    if (result.ok) return json({ token: result.token })
    if (result.reason === 'too-large') {
      return json(
        { errors: [{ message: 'This draft is too large to back up.' }], bytes: result.bytes },
        413,
      )
    }
    // Deliberately undifferentiated: saying WHICH precondition failed would leak whether another
    // session exists for a row this caller may not read. The client's response is the same — refetch.
    return json({ errors: [{ message: 'This backup is out of date — reload to continue.' }] }, 409)
  },
}

/** 3. The restore prompt's read — the caller's OWN active capture, or null. */
export const recoveryGetEndpoint: Endpoint = {
  path: '/:id/recovery',
  method: 'get',
  handler: async (req) => {
    const version = await loadEditable(req)
    const active = await readActiveCapture(req, {
      userId: (req.user as User).id,
      sourceVersionId: version.id,
    })
    if (!active) return json({ capture: null })

    // The client compares these against the source it just loaded; a mismatch means the capture is
    // view/copy/discard only and must never be applied (SPEC §5).
    return json({
      capture: {
        content: active.content,
        baseUpdatedAt: active.baseUpdatedAt,
        schemaVersion: active.schemaVersion,
        stale: active.baseUpdatedAt !== new Date(String(version.updatedAt)).toISOString(),
        schemaMismatch: active.schemaVersion !== CAPTURE_SCHEMA_VERSION,
      },
      token: active.token,
    })
  },
}

/** 4. Explicit discard ⇒ retire. */
export const recoveryDiscardEndpoint: Endpoint = {
  path: '/:id/recovery',
  method: 'delete',
  handler: async (req) => {
    const version = await loadEditable(req)
    const limited = await enforceUserRateLimit(req, 'recovery')
    if (limited) return limited

    const payload = await body(req)
    const result = await retire(
      req,
      { userId: (req.user as User).id, sourceVersionId: version.id },
      {
        by: 'discard',
        generation: requireCounter(payload.generation, 'generation'),
        expectedRevision: requireCounter(payload.expectedRevision, 'expectedRevision'),
      },
    )
    if (!result.ok) {
      return json(
        { errors: [{ message: 'This backup is out of date — reload to continue.' }] },
        409,
      )
    }
    return json({ token: result.token })
  },
}

/** 5. Site-Admin metadata — existence and shape, NEVER content. */
export const recoveryMetaEndpoint: Endpoint = {
  path: '/:id/recovery/meta',
  method: 'get',
  handler: async (req) => {
    const version = await loadForAdmin(req)
    const rows = await readCaptureMetadata(req, { sourceVersionId: version.id })
    return json({ captures: rows })
  },
}

/** 6. Site-Admin cleanup — retires one user's capture, echoing the revision op 5 reported. */
export const recoveryCleanupEndpoint: Endpoint = {
  path: '/:id/recovery/meta/cleanup',
  method: 'post',
  handler: async (req) => {
    const version = await loadForAdmin(req)
    const payload = await body(req)
    const result = await retire(
      req,
      {
        // The ONE operation that acts on another user's row — hence Site-Admin-only, and hence the
        // revision precondition, so an operator cannot clear a capture that changed between the
        // metadata read and this call.
        userId: requireCounter(payload.userId, 'userId'),
        sourceVersionId: version.id,
      },
      {
        by: 'admin-cleanup',
        expectedRevision: requireCounter(payload.expectedRevision, 'expectedRevision'),
      },
    )
    if (!result.ok) {
      return json(
        { errors: [{ message: 'That capture changed since you looked — refresh and try again.' }] },
        409,
      )
    }
    return json({ token: result.token })
  },
}

export const recoveryEndpoints: Endpoint[] = [
  recoveryStartEndpoint,
  recoveryCaptureEndpoint,
  recoveryGetEndpoint,
  recoveryDiscardEndpoint,
  recoveryMetaEndpoint,
  recoveryCleanupEndpoint,
]
