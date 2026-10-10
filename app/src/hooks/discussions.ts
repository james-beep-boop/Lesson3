/**
 * Posting, immutability and thread deletion for the forum collections
 * (`docs/DESIGN-discussions-2026-10-09.md` §16.4 and the 3a contract in §16.5).
 *
 * TRUSTED SYSTEM PATHS. A create with no `req.user` is a Local-API system write (fixtures, scripts),
 * the same convention as `collections/Messages.ts`: it supplies its own author and is neither stamped
 * nor charged. Every request from a browser has a user, and is stamped.
 *
 * SYSTEM-WRITTEN FIELDS need no reset here. Field access (`create: () => false`) deletes a client's value
 * and then applies the field's `defaultValue`, in the FIELD pass that runs before any collection hook
 * (verified in the installed `fields/hooks/beforeValidate/promise.js` and `collections/operations/create.js`).
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError } from 'payload'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'

import {
  insertParticipation,
  refLabelFor,
  requireJoinedAtSeq,
  requireSubmissionKey,
} from '../lib/discussions'
import { consumeRateLimit } from '../lib/rateLimit'
import { findReadableVersion } from '../lib/readBundle'
import { relId } from '../lib/relId'
import { lockRows, lockUserForReference, rowsOf, txDb } from '../lib/txDb'
import type { User } from '../payload-types'

type Data = Record<string, unknown>
type PostCollection = 'discussion-topics' | 'discussion-replies'

/** Server-derived reference fields for a client-supplied `refVersion` (or none). */
async function resolveReference(
  req: PayloadRequest,
  refVersion: unknown,
  user: User,
): Promise<{ refVersion: number | null; refPlan: number | null; refLabel: string | null }> {
  if (refVersion == null || refVersion === '') {
    return { refVersion: null, refPlan: null, refLabel: null }
  }
  const id = relId(refVersion)
  if (id == null) throw new APIError('The referenced lesson version is not available.', 400)
  // `findReadableVersion` answers null only for "you cannot see it" (404/403) and rethrows real faults —
  // the distinction `validateContextLink` in collections/Messages.ts learned the hard way. The projection
  // matters: a version carries the whole lesson bundle, and the label needs five fields.
  const version = await findReadableVersion(req.payload, {
    id,
    user,
    req,
    select: { lessonPlan: true, title: true, semver: true, meta: { substrand_name: true } },
  })
  if (!version) throw new APIError('The referenced lesson version is not available.', 400)
  return {
    refVersion: version.id,
    refPlan: relId(version.lessonPlan),
    refLabel: refLabelFor(version),
  }
}

/**
 * The stamping every authenticated create shares, in this order:
 *
 *   1. `submissionKey` — validated, never generated (contract item 1);
 *   2. the duplicate check — BEFORE the charge, so a retry whose response was lost is not charged twice;
 *   3. the `discussionPost` daily cap;
 *   4. `author` from the session, and the server-derived reference fields.
 *
 * ⚑ UNCONDITIONAL. Field access has already dropped any client-supplied `author`/`refPlan`/`refLabel`
 * by the time collection `beforeValidate` runs, and these assignments then write the authoritative
 * values. Forged system fields are ignored, not rejected (contract item 1).
 */
async function stampAuthenticatedCreate(
  collection: PostCollection,
  data: Data,
  req: PayloadRequest,
): Promise<Data> {
  const user = req.user as User
  const submissionKey = requireSubmissionKey(data.submissionKey)

  const { totalDocs } = await req.payload.count({
    collection,
    where: { and: [{ author: { equals: user.id } }, { submissionKey: { equals: submissionKey } }] },
    overrideAccess: true,
    req,
  })
  if (totalDocs > 0) throw new APIError('This was already posted.', 409)

  const { ok, retryAfterSec } = await consumeRateLimit(req, 'discussionPost', String(user.id))
  if (!ok) {
    throw new APIError(
      `Daily posting limit reached — please wait ${retryAfterSec}s and try again.`,
      429,
    )
  }

  return {
    ...data,
    submissionKey,
    author: user.id,
    ...(await resolveReference(req, data.refVersion, user)),
  }
}

// ─── Topics ────────────────────────────────────────────────────────────────────────────────────────

export const stampTopicCreate: CollectionBeforeValidateHook = async ({ data, operation, req }) =>
  operation === 'create' && data && req.user
    ? stampAuthenticatedCreate('discussion-topics', data, req)
    : data

/**
 * The topic's author joins its participants at `lastReadSeq = 0`; the referenced version's author joins
 * at `-1`, so the opening post itself is unread for them (§16.4 "Invited participants"). Only the TOPIC's
 * reference invites anyone. Both inserts run on the create's transaction.
 */
export const joinTopicParticipants: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  const topicId = Number(doc.id)
  const authorId = relId(doc.author)
  if (authorId != null)
    await insertParticipation(req, { userId: authorId, topicId, lastReadSeq: 0 })

  const refVersionId = relId(doc.refVersion)
  if (refVersionId != null) {
    const version = await req.payload.findByID({
      collection: 'lesson-bundle-versions',
      id: refVersionId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      select: { author: true },
      req,
    })
    const invitedId = relId(version?.author)
    if (invitedId != null && invitedId !== authorId) {
      await insertParticipation(req, { userId: invitedId, topicId, lastReadSeq: -1 })
    }
  }
  return doc
}

/**
 * Whole-thread deletion: lock the topic (the lock replies take), then remove its replies and
 * participation rows in the same transaction. System writes, ungated by the forum switch, so a Site
 * Administrator's permitted delete also works while the forum is off (contract item 3).
 *
 * ⚑ PLAIN SQL DELETES, not `payload.delete({ where })`: that loads every reply and runs a lock-status
 * check, a delete and an afterRead per row — hundreds of round trips for a long thread, all while holding
 * the topic lock. Replies and participation have no delete hooks to skip, and the
 * `payload_locked_documents_rels` foreign keys cascade on their own.
 */
export const cascadeDeleteThread: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const topicId = Number(id)
  await lockRows(req, 'discussion_topics', [topicId])
  const db = await txDb(req, { requireTransaction: true })
  await db.execute(sql`DELETE FROM "discussion_replies" WHERE "topic_id" = ${topicId}`)
  await db.execute(sql`DELETE FROM "discussion_participation" WHERE "topic_id" = ${topicId}`)
}

// ─── Replies ───────────────────────────────────────────────────────────────────────────────────────

export const stampReplyCreate: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data || !req.user) return data
  // Shape check here; the bound against the topic's `lastSeq` needs the topic lock (beforeChange).
  const joinedAtSeq = requireJoinedAtSeq(data.joinedAtSeq)
  return { ...(await stampAuthenticatedCreate('discussion-replies', data, req)), joinedAtSeq }
}

/**
 * Number the reply within its thread and advance the thread's activity — ONE statement
 * (§16.4 "Ordering"):
 *
 *   UPDATE discussion_topics SET last_seq = last_seq + 1, last_activity_at = … RETURNING last_seq
 *
 * The UPDATE takes the topic's row lock, so replies to one topic are serialised, and a reply racing a
 * thread deletion either commits first (and is cascaded) or finds no topic and fails cleanly. The value it
 * returns is this reply's `seq`. It runs in the create's transaction, so a reply that fails afterwards
 * rolls the counter and the activity back with it.
 *
 * ⚑ RAW SQL, AND WHY (the Payload-first rule's documented gap). Payload cannot increment-and-return
 * atomically; the lock + read + `payload.update` it replaced held the topic lock for ~10 round trips per
 * reply. The statement touches only system fields, never content, so it needs nothing from
 * `rejectContentEdits`.
 *
 * ⚑ LOCK ORDER: THE AUTHOR'S USER ROW FIRST, THEN THE TOPIC (review 2026-10-09). The reply's author
 * foreign key takes `FOR KEY SHARE` on the user row. Taken after the topic lock, that formed a cycle with
 * account deletion, which locks the user row (`lockDeletingUser`) and then, through `ON DELETE SET NULL`,
 * updates every topic the user authored: reply held topic → wanted user; deletion held user → wanted
 * topic; Postgres aborted one with 40P01. Taking the user row first puts both in the same order — user,
 * then topic — and a reply by an account already being deleted waits for it, finds the account gone, and
 * is refused. The rule is general: any transaction that locks a topic and then writes a reference to a
 * user must take that user's row first (3b's redaction stamps `redactedBy`).
 *
 * ⚑ ACTIVITY NEVER MOVES BACKWARDS (review 2026-10-09). `now()` is the TRANSACTION's start time, so a reply
 * whose transaction began earlier but reached this statement later wrote an older `lastActivityAt` than
 * the reply before it, while taking the higher `seq`. `clock_timestamp()` is the time this statement runs,
 * and `GREATEST` with the stored value also absorbs any skew from the app server's clock, which stamps a
 * new topic's first `lastActivityAt`.
 *
 * `joinedAtSeq` is checked against the PREVIOUS `lastSeq` (`seq - 1`): it can never legitimately exceed
 * it, because `lastSeq` only grows, so a larger value can only be forged.
 */
export const orderReply: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const topicId = relId(data.topic)
  if (topicId == null) throw new APIError('A reply needs a discussion.', 400)
  const db = await txDb(req, { requireTransaction: true })

  const authorId = relId(data.author)
  if (authorId != null && !(await lockUserForReference(req, authorId))) {
    throw new APIError('This account is no longer available.', 403)
  }

  const [row] = rowsOf(
    await db.execute(sql`
      UPDATE "discussion_topics"
         SET "last_seq" = COALESCE("last_seq", 0) + 1,
             "last_activity_at" = GREATEST(COALESCE("last_activity_at", '-infinity'), clock_timestamp()),
             "updated_at" = clock_timestamp()
       WHERE "id" = ${topicId}
      RETURNING "last_seq"`),
  )
  if (!row) throw new APIError('This discussion no longer exists.', 404)

  const seq = Number(row.last_seq)
  const joinedAtSeq = data.joinedAtSeq == null ? seq - 1 : Number(data.joinedAtSeq)
  if (joinedAtSeq > seq - 1) {
    throw new APIError('joinedAtSeq is ahead of this discussion — reload and try again.', 400)
  }
  return { ...data, seq, joinedAtSeq }
}

/**
 * After the reply row exists, still inside its transaction: add the author to the participants at the
 * `joinedAtSeq` they replied from. An author who already participates keeps their `lastReadSeq`
 * (`insertParticipation` is `ON CONFLICT DO NOTHING`). `data` here is what `orderReply` returned, so
 * `joinedAtSeq` — a virtual field, never stored — is still on it.
 */
export const joinReplyAuthor: CollectionAfterChangeHook = async ({ data, doc, operation, req }) => {
  if (operation !== 'create') return doc
  const authorId = relId(doc.author)
  const topicId = relId(doc.topic)
  if (authorId != null && topicId != null) {
    await insertParticipation(req, {
      userId: authorId,
      topicId,
      lastReadSeq: Number(data.joinedAtSeq),
    })
  }
  return doc
}

// ─── Immutability ──────────────────────────────────────────────────────────────────────────────────

/** A relationship value collapses to its id; anything that is not a valid id stays distinct. */
const INVALID = Symbol('not an id')
const asRelationship = (value: unknown): number | null | typeof INVALID => {
  if (value == null) return null
  return relId(value) ?? INVALID
}

/**
 * Refuse any change to published content on update (§16.4 "Immutability").
 *
 * ⚑ REQUIRED, NOT BELT-AND-BRACES. Collection `update` access is `() => false`, but the system writes
 * that legitimately update these rows (pin and redaction, in 3b) run with `overrideAccess: true`, which
 * bypasses FIELD access too (DECISIONS 2026-08-21). This hook is what keeps a trusted-path write from
 * changing what someone posted.
 *
 * ⚑ TWO KINDS OF FIELD, compared differently (review 2026-10-09). The first version normalised every
 * value as a possible relationship, so a body `"12"` "equalled" `{ id: 12 }`, and `"null"` equalled any
 * object without an id. Now:
 *   - `scalar` fields (text, numbers) compare by strict identity — an object never equals a string;
 *   - `relationships` compare by id, where `{ id: 12 }`, `12` and `"12"` are the same reference, and a
 *     value that is not an id at all is itself a change, never "equal to nothing".
 */
export const rejectContentEdits =
  (fields: {
    scalar: readonly string[]
    relationships: readonly string[]
  }): CollectionBeforeChangeHook =>
  ({ data, operation, originalDoc }) => {
    if (operation !== 'update' || !data) return data
    const changed =
      fields.scalar.some(
        (field) => field in data && (data[field] ?? null) !== (originalDoc?.[field] ?? null),
      ) ||
      fields.relationships.some((field) => {
        if (!(field in data)) return false
        const next = asRelationship(data[field])
        return next === INVALID || next !== asRelationship(originalDoc?.[field])
      })
    if (changed) throw new APIError('Published discussions cannot be edited.', 403)
    return data
  }

/** Content every post has; the topic adds its title, a reply its thread and position. */
const POST_SCALARS = ['body', 'submissionKey', 'refLabel']
const POST_RELATIONSHIPS = ['author', 'refVersion', 'refPlan']
export const TOPIC_CONTENT_FIELDS = {
  scalar: ['title', ...POST_SCALARS],
  relationships: POST_RELATIONSHIPS,
}
export const REPLY_CONTENT_FIELDS = {
  scalar: ['seq', ...POST_SCALARS],
  relationships: ['topic', ...POST_RELATIONSHIPS],
}
