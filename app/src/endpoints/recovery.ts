/**
 * Edit-recovery endpoints — **SEVEN operations across FIVE URL paths**, mounted on
 * `lesson-bundle-versions` beside `/:id/preview` and `/:id/save-as-new`.
 *
 * ⚑ Three counts describe this surface and they are all different, so state which one you mean.
 * **Six** Payload `Endpoint` configurations, one per method+path pair — this is the count the
 * wire-authz rule is written in, since each owes its own 401/403/404. **Four** distinct URL paths,
 * because `/:id/recovery` carries POST, GET and DELETE. **Five** rows in design §2's table, which
 * bundles Site-Admin metadata and cleanup onto one line. Earlier versions of this docblock said "five
 * route paths", which is none of the three.
 *
 * | # | Method + path                        | Who         | unauth | wrong role |
 * |---|--------------------------------------|-------------|--------|------------|
 * | 1 | `POST   /:id/recovery/start`         | editing access      | 401    | 404        |
 * | 2 | `POST   /:id/recovery`   (capture)   | editing access      | 401    | 404        |
 * | 3 | `GET    /:id/recovery`               | editing access      | 401    | 404        |
 * | 4 | `DELETE /:id/recovery`   (discard)   | editing access      | 401    | 404        |
 * | 5 | `GET    /:id/recovery/meta`          | Site Admin  | 401    | 403        |
 * | 6 | `POST   /:id/recovery/meta/cleanup`  | Site Admin  | 401    | 403        |
 * | 7 | `GET    /:id/recovery/unsaved-count` | may delete  | 401    | 403        |
 *
 * ⚑ Op 7 (added 2026-10-17) is not part of design §2's table: it feeds the delete confirmations'
 * warning that deleting a version discards other people's unsaved work (SPEC §5, "Keep for later").
 * It returns COUNTS only, and only to a caller allowed to delete that version — the one audience
 * for whom the number changes a decision. 403 rather than 404 for the same reason as ops 5-6: every
 * signed-in user may read a version, so its existence is not the secret.
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
 * ⚑ **Bodies are size-checked before they are parsed** — but only as far as the header can be
 * trusted. `readRecoveryBody` rejects an oversized declared `Content-Length` before `req.json()`
 * materialises the body, because rate limiting bounds how OFTEN an authenticated editor may post, not
 * how large a single post may be. It is NOT a memory bound: a request with no `Content-Length` still
 * reaches the parse. See `recoveryParse.ts` for the sizing and for what a real ceiling would take.
 *
 * Each operation re-loads the source and re-authorizes on every call, then the kernel writes with
 * `overrideAccess` — the pattern CLAUDE.md notes is only as safe as the tests that prove the gate runs
 * first, which is why every operation here owns wire-level 401/403/404 coverage in `tests/http`.
 */
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isEditorFor, isSiteAdmin, toId } from '../access'
import { canDeleteVersionDoc } from '../access/versioning'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import { enforceUserRateLimit } from '../lib/rateLimit'
import {
  capture,
  countUnsavedWorkOnVersion,
  readActiveCapture,
  readCaptureMetadata,
  retire,
  start,
} from '../lib/editRecovery/kernel'
import { CAPTURE_SCHEMA_VERSION, captureProvenance } from '../lib/editRecovery/provenance'
import { readRecoveryBody, requireCounter, requireDocument } from './recoveryParse'
import type { LessonBundleVersion, User } from '../payload-types'

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
                'You have too many lesson plans with unsaved changes. Save or discard one under Your unsaved work in Manage, then try again.',
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

    const payload = await readRecoveryBody(req)
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
        { errors: [{ message: 'These changes are too large to back up.' }], bytes: result.bytes },
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
        // ⚑ When the CAPTURE was written — the row's own `updated_at`, which is what the restore
        // prompt shows the teacher. Distinct from `baseUpdatedAt` below, which is the SOURCE
        // VERSION's mtime and exists only for the staleness comparison; showing that one dates a
        // teacher's afternoon to whenever the plan was last saved. Sent here rather than left for the
        // client to re-attach from the token: it is a fact about the row, and the client assembling
        // it from a second field made `OfferedCapture` a description of what the client rebuilt
        // rather than of what the wire carries.
        capturedAt: active.token.updatedAt,
        baseUpdatedAt: active.baseUpdatedAt,
        schemaVersion: active.schemaVersion,
        ...captureProvenance(active, version.updatedAt),
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

    const payload = await readRecoveryBody(req)
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
    const payload = await readRecoveryBody(req)
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

/**
 * 7. How many people would lose unsaved work if this version were deleted — counts, never names.
 *
 * Gated on `canDeleteVersionDoc`, the per-document form of the delete access, so only someone who
 * could act on the warning sees it. It does not repeat the Official-not-deletable rule: the number is
 * advisory, and the delete itself remains the authority on whether deletion happens.
 */
export const recoveryUnsavedCountEndpoint: Endpoint = {
  path: '/:id/recovery/unsaved-count',
  method: 'get',
  handler: async (req) => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    const version = await findReadableVersion(req.payload, {
      id: versionId(req),
      user: req.user as User,
      req,
    })
    if (!version) throw new APIError('Version not found', 404)
    if (!canDeleteVersionDoc(req.user as User, version)) {
      throw new APIError('Only someone who may delete this version can see this.', 403)
    }
    const counts = await countUnsavedWorkOnVersion(req, {
      sourceVersionId: version.id,
      callerId: (req.user as User).id,
    })
    return json(counts)
  },
}

export const recoveryEndpoints: Endpoint[] = [
  recoveryStartEndpoint,
  recoveryCaptureEndpoint,
  recoveryGetEndpoint,
  recoveryDiscardEndpoint,
  recoveryMetaEndpoint,
  recoveryCleanupEndpoint,
  recoveryUnsavedCountEndpoint,
]
