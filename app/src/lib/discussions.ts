/**
 * Discussions — the shared rules the three forum collections and their hooks are built from
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4, and the 3a contract in §16.5).
 *
 * Gates, input validators, the reference label, and the one participation insert. Kept here rather than
 * inside a collection so the three collections, their hooks and the thread-delete endpoint cannot hold
 * three slightly different copies of "who may do what while the forum is off".
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError, type Access, type Field, type PayloadRequest, type Validate } from 'payload'

import { isSiteAdmin } from '../access'
import { systemOnly } from '../access/bundle'
import type { LessonBundleVersion, User } from '../payload-types'
import { lessonDisplayName } from './substrand'
import { isForumEnabled } from './systemFlags'
import { txDb } from './txDb'

export const MAX_TITLE_LENGTH = 150
export const MAX_BODY_LENGTH = 5000

// ─── Gates (the 3a table in §16.5) ─────────────────────────────────────────────────────────────────

/** Create a topic or reply: a signed-in caller, and the forum on. Nobody may post while it is off. */
export const forumPosting: Access = async ({ req }) =>
  Boolean(req.user) && (await isForumEnabled(req))

/**
 * Read topics and replies: any signed-in caller while the forum is on; while it is OFF, the Site
 * Administrator only — the moderation-only view (operator decision 2026-10-09, §16.1), so a privacy
 * problem can be found and removed without re-exposing the forum to everyone.
 */
export const forumReading: Access = async ({ req }) => {
  if (!req.user) return false
  if (isSiteAdmin(req.user as User)) return true
  return isForumEnabled(req)
}

/**
 * Read participation (personal unread state): your own rows only, and only while the forum is on —
 * there is no moderation reason to read it while off, so the Site Administrator gets no exception.
 */
export const ownParticipation: Access = async ({ req }) => {
  if (!req.user || !(await isForumEnabled(req))) return false
  return { user: { equals: (req.user as User).id } }
}

// ─── Client inputs ─────────────────────────────────────────────────────────────────────────────────

/**
 * The composer's duplicate-submission key: generated in the browser when the composer opens, kept in
 * memory only, and reused for every retry of one submission. The server validates it and never
 * generates or replaces it (§16.5 contract, item 1).
 */
const SUBMISSION_KEY = /^[A-Za-z0-9-]{16,64}$/

export function requireSubmissionKey(value: unknown): string {
  if (typeof value !== 'string' || !SUBMISSION_KEY.test(value)) {
    throw new APIError('submissionKey is required — reload the page and try again.', 400)
  }
  return value
}

/**
 * `joinedAtSeq`: the topic's `lastSeq` when the page holding the reply box was rendered. Checked here
 * for shape; checked against the LOCKED topic's `lastSeq` in the reply's `beforeChange`, because only
 * then is "exceeds lastSeq" meaningful.
 */
export function requireJoinedAtSeq(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new APIError('joinedAtSeq must be a whole number of at least 0.', 400)
  }
  return value
}

/**
 * Title / body validation: required when CREATED, length-capped always.
 *
 * ⚑ NOT `required: true`. Redaction (3b) blanks a title or body on update, and a plain `required`
 * would then fail the redacted row's own write. Payload passes `operation` to field validators
 * (verified in the installed `fields/config/types.d.ts`), so "required at create" is expressible here.
 * A custom `validate` replaces the built-in one, which is why the length cap is enforced here too.
 */
export const createdText =
  (label: string, max: number): Validate =>
  (value, { operation }) => {
    const text = typeof value === 'string' ? value : ''
    if (operation === 'create' && text.trim() === '') return `${label} is required.`
    if (text.length > max) return `${label} can be at most ${max} characters.`
    return true
  }

// ─── Shared fields ─────────────────────────────────────────────────────────────────────────────────

/**
 * Server-written: a client may not set it on create. No field-level `update` rule is needed or
 * meaningful — the collections' `update` access is `() => false`, and the trusted path that does update
 * these rows (`overrideAccess`) skips field access altogether. `rejectContentEdits` is what guards that
 * path (hooks/discussions.ts).
 */
export const serverWritten = { create: systemOnly }

/**
 * The fields every post has, topic or reply — one definition, so the privacy rule is kept in ONE place:
 * ⚑ EVERY RELATIONSHIP IS `maxDepth: 0` (§16.5 contract, item 4). A REST read at `?depth=2` must return
 * ids, never a populated user (email, roles, assignments) or a whole lesson version.
 */
export const postFields = (): Field[] => [
  {
    // Optional, so deleting an account leaves the post (FK `SET NULL` → shown as "Deleted User").
    name: 'author',
    type: 'relationship',
    relationTo: 'users',
    maxDepth: 0,
    index: true,
    access: serverWritten,
  },
  // Client-generated per composer; validated, never generated here (hooks/discussions.ts).
  { name: 'submissionKey', type: 'text' },
  {
    // The only client-supplied reference. Nullable: deleting the version clears it (`SET NULL`).
    name: 'refVersion',
    type: 'relationship',
    relationTo: 'lesson-bundle-versions',
    maxDepth: 0,
  },
  {
    name: 'refPlan',
    type: 'relationship',
    relationTo: 'lesson-plans',
    maxDepth: 0,
    access: serverWritten,
  },
  // `<lesson name> · v<semver>`, kept so an unavailable reference can still say what it was.
  { name: 'refLabel', type: 'text', access: serverWritten },
  { name: 'redactedAt', type: 'date', access: serverWritten },
  {
    name: 'redactedBy',
    type: 'relationship',
    relationTo: 'users',
    maxDepth: 0,
    access: serverWritten,
  },
]

// ─── References ────────────────────────────────────────────────────────────────────────────────────

/**
 * The snapshot label a reference keeps after its version is deleted: `<lesson name> · v<semver>`
 * (§16.2). Lesson names are readable by every signed-in user, so the snapshot discloses nothing new.
 */
export const refLabelFor = (
  version: Pick<LessonBundleVersion, 'meta' | 'title' | 'semver'>,
): string =>
  `${lessonDisplayName(version.meta?.substrand_name, version.title)} · v${version.semver ?? '?'}`

// ─── Participation ─────────────────────────────────────────────────────────────────────────────────

/**
 * Add a user to a discussion's participants, unless they already are one.
 *
 * ⚑ RAW SQL, AND WHY (the Payload-first rule's documented gap). Payload has no conditional insert, and
 * this needs two things a find-then-create cannot give atomically:
 *
 *   - `ON CONFLICT (user_id, topic_id) DO NOTHING` — an existing row keeps its `lastReadSeq`. Posting
 *     must never move a participant's read marker (§16.4).
 *   - `FOR KEY SHARE` on the user row — coordination with account deletion (§16.5 contract, item 2).
 *     `lockDeletingUser` (hooks/userRoles.ts) takes `FOR UPDATE` on the same row at the start of every
 *     account deletion, so this insert either commits first (and is then cascaded away) or waits and,
 *     finding the user gone, inserts NOTHING. Without it, a row inserted between the cascade and the user DELETE
 *     would hit the `NOT NULL` user column when `ON DELETE SET NULL` fired, and the account deletion
 *     would fail. And because a vanished user yields no row rather than an error, someone else's new
 *     topic never fails because its invited version author is being deleted.
 *
 * Runs on the caller's transaction (`txDb` with `requireTransaction`), so it commits or rolls back with
 * the post that caused it.
 */
export async function insertParticipation(
  req: PayloadRequest,
  args: { userId: number; topicId: number; lastReadSeq: number },
): Promise<void> {
  const db = await txDb(req, { requireTransaction: true })
  await db.execute(sql`
    INSERT INTO "discussion_participation" ("user_id", "topic_id", "last_read_seq", "updated_at", "created_at")
    SELECT u."id", ${args.topicId}, ${args.lastReadSeq}, now(), now()
      FROM "users" u
     WHERE u."id" = ${args.userId}
       FOR KEY SHARE
    ON CONFLICT ("user_id", "topic_id") DO NOTHING`)
}
