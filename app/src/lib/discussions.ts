/**
 * Discussions — the shared rules the three forum collections and their hooks are built from
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4, and the 3a contract in §16.5).
 *
 * Gates, input validators, the reference label, and the one participation insert. Kept here rather than
 * inside a collection so the three collections, their hooks and the thread-delete endpoint cannot hold
 * three slightly different copies of "who may do what while the forum is off".
 */
import { sql } from '@payloadcms/db-postgres'
import {
  APIError,
  type Access,
  type Field,
  type Payload,
  type PayloadRequest,
  type Validate,
  type Where,
} from 'payload'

import { isSiteAdmin } from '../access'
import { systemOnly } from '../access/bundle'
import type { User } from '../payload-types'
import { lessonDisplayName } from './substrand'
import { isForumEnabled, readSystemFlags } from './systemFlags'
import { poolDb, rowsOf, sqlIdList, txDb } from './txDb'

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
export const refLabelFor = (version: {
  meta?: { substrand_name?: string | null } | null
  title?: string | null
  semver?: string | null
}): string =>
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

// ─── Reading (3b) ──────────────────────────────────────────────────────────────────────────────────

/** A read-marker request: the displayed range of reply seqs, `0 ≤ fromSeq ≤ throughSeq`. */
export interface ReadRange {
  fromSeq: number
  throughSeq: number
}

/**
 * Advance a participant's read marker over the replies they were just shown (§16.4 "Mark-read"). Returns
 * null when the topic does not exist; otherwise the thread's `lastSeq` and the caller's marker after the
 * call — null when the caller does not participate (reading alone never subscribes anyone, so nothing is
 * written).
 *
 * ONE STATEMENT, so it is atomic without a lock, and one round trip on the hottest forum path:
 *   - `last_read_seq < $through` — the marker never moves backwards, whichever of two tabs reports last,
 *     and a re-report of what is already read writes nothing;
 *   - `$from <= last_read_seq + 1` — it only advances over a range that follows on directly from what was
 *     already read, so a later page can never mark skipped replies as read. (An invited version author at
 *     −1 reading from 0 qualifies, which marks the opening post read.)
 *   - `$through <= last_seq` — a range past the thread's end can only be forged; nothing is written, and
 *     the caller refuses it from the returned `lastSeq`.
 *
 * When nothing moved, the marker reported is the one this statement's snapshot saw — a concurrent tab's
 * advance may not be in it yet. The stored marker is right either way; the next call reports it.
 *
 * ⚑ RAW SQL — the Payload-first rule's documented gap: a conditional, monotonic update is not expressible
 * through `payload.update`.
 */
export async function advanceReadMarker(
  req: PayloadRequest,
  args: { userId: number; topicId: number } & ReadRange,
): Promise<{ lastSeq: number; lastReadSeq: number | null } | null> {
  const db = await txDb(req)
  const [row] = rowsOf(
    await db.execute(sql`
      WITH "t" AS (SELECT "last_seq" FROM "discussion_topics" WHERE "id" = ${args.topicId}),
      "moved" AS (
        UPDATE "discussion_participation" p
           SET "last_read_seq" = ${args.throughSeq}, "updated_at" = clock_timestamp()
          FROM "t"
         WHERE p."user_id" = ${args.userId} AND p."topic_id" = ${args.topicId}
           AND ${args.throughSeq} <= COALESCE("t"."last_seq", 0)
           AND p."last_read_seq" < ${args.throughSeq}
           AND ${args.fromSeq} <= p."last_read_seq" + 1
        RETURNING p."last_read_seq"
      )
      SELECT COALESCE("t"."last_seq", 0) AS "last_seq",
             COALESCE(
               (SELECT "last_read_seq" FROM "moved"),
               (SELECT "last_read_seq" FROM "discussion_participation"
                 WHERE "user_id" = ${args.userId} AND "topic_id" = ${args.topicId})
             ) AS "last_read_seq"
        FROM "t"`),
  )
  if (!row) return null
  return {
    lastSeq: Number(row.last_seq),
    lastReadSeq: row.last_read_seq == null ? null : Number(row.last_read_seq),
  }
}

/**
 * The unread condition for one participation row `p` of user `$user` (§16.4 "Unread query"): the opening
 * post is unread for an invited participant (`last_read_seq < 0`), or a later reply exists by someone
 * else.
 *
 * ⚑ `IS DISTINCT FROM`, NOT `<>`. A deleted account's posts have a NULL author, and `NULL <> $user` is NULL —
 * which would silently drop every "Deleted User" reply from the dot.
 */
const unreadCondition = (userId: number) => sql`(
  (p."last_read_seq" < 0 AND EXISTS (
    SELECT 1 FROM "discussion_topics" t
     WHERE t."id" = p."topic_id" AND t."author_id" IS DISTINCT FROM ${userId}
  ))
  OR EXISTS (
    SELECT 1 FROM "discussion_replies" r
     WHERE r."topic_id" = p."topic_id" AND r."seq" > p."last_read_seq"
       AND r."author_id" IS DISTINCT FROM ${userId}
  )
)`

/**
 * Has `userId` anything unread in the discussions they take part in? — the Discuss nav dot.
 *
 * Gated here, not by the caller: while the forum is off it is always `false` (§16.5, 3b gate table), so a
 * page that forgets to check cannot light a dot for a switched-off forum. Read-only, on the pool.
 */
export async function hasUnread(payload: Payload, userId: number): Promise<boolean> {
  if (!(await readSystemFlags(payload)).forumEnabled) return false
  const [row] = rowsOf(
    await poolDb(payload).execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM "discussion_participation" p
         WHERE p."user_id" = ${userId} AND ${unreadCondition(userId)}
      ) AS "unread"`),
  )
  return row?.unread === true
}

/**
 * Which of `topicIds` (one page of the topic list) have something unread for `userId` — the per-row
 * markers. Bounded by the page: only those ids are examined. Empty while the forum is off.
 */
export async function unreadTopicIds(
  payload: Payload,
  userId: number,
  topicIds: readonly number[],
): Promise<number[]> {
  if (topicIds.length === 0 || !(await readSystemFlags(payload)).forumEnabled) return []
  const rows = rowsOf(
    await poolDb(payload).execute(sql`
      SELECT p."topic_id" FROM "discussion_participation" p
       WHERE p."user_id" = ${userId} AND p."topic_id" IN (${sqlIdList(topicIds)})
         AND ${unreadCondition(userId)}`),
  )
  return rows.map((row) => Number(row.topic_id))
}

// ─── Search (3b) ───────────────────────────────────────────────────────────────────────────────────

/** Longest search text honoured — bounds the query, not the reader. */
export const MAX_SEARCH_LENGTH = 200

/** Make `%`, `_` and `\` literal in a LIKE pattern. Payload's `like` does not escape them (spike 2026-10-09). */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * The title-search `where` (§16.2): every word must appear in the title, in any order, case-insensitive.
 * Payload's own `like` already splits on spaces and requires every word; this collapses whitespace,
 * escapes the LIKE wildcards and bounds the length. Null for an empty search.
 */
export function titleSearchWhere(query: string): Where | null {
  const words = query.slice(0, MAX_SEARCH_LENGTH).trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return { title: { like: words.map(escapeLike).join(' ') } }
}

/** Topics per page in the list and in search results (§16.2). */
export const TOPIC_PAGE_SIZE = 20

/**
 * Title search, as the caller — the ONE entry point, because it carries the 3b gate: while the forum is off
 * it returns null for everyone, Site Administrator included. (Reading threads stays open to the Site
 * Administrator while off, for moderation; searching does not.) Null also for an empty search. Results are
 * one row per topic, newest activity first, through the collection's own read access.
 */
export async function searchTopicTitles(
  payload: Payload,
  args: { user: User; query: string; page?: number },
) {
  const where = titleSearchWhere(args.query)
  if (!where || !(await readSystemFlags(payload)).forumEnabled) return null
  return payload.find({
    collection: 'discussion-topics',
    where,
    sort: ['-lastActivityAt', '-id'],
    limit: TOPIC_PAGE_SIZE,
    page: args.page ?? 1,
    depth: 0,
    overrideAccess: false,
    user: args.user,
  })
}
