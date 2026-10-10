/**
 * Discussions 3b — mark-read, pin and redaction (`docs/DESIGN-discussions-2026-10-09.md` §16.4–16.5).
 *
 *   POST /api/discussion-topics/:id/mark-read   { fromSeq, throughSeq }   signed in, forum ON
 *   POST /api/discussion-topics/:id/pin         { pinned }                Site Administrator, forum ON
 *   POST /api/discussion-topics/:id/redact      { title?, body? }         Site Administrator, on or off
 *   POST /api/discussion-replies/:id/redact     {}                        Site Administrator, on or off
 *
 * Gates follow the 3b table: while the forum is off nobody marks read or pins, and redaction — a
 * moderation action — stays available to the Site Administrator.
 *
 * ⚑ REDACTION IS ONE CONDITIONAL UPDATE, not a write through `payload.update` past the immutability guard
 * (operator decision 2026-10-10; a deliberate deviation from §16.4, which planned a `req.context` marker
 * the guard would honour). `… SET body = '' … WHERE id = $id AND redacted_at IS NULL` refuses a second
 * redaction atomically, and `rejectContentEdits` stays strict for EVERY Payload path — there is no
 * exception in it to get wrong.
 *
 * Pinning and both redactions run through `moderate` (endpoints/moderate.ts), with whole-thread deletion:
 * the post locked before anything reads it, the caller re-checked after that wait, the log written after
 * the commit. Redaction also locks the administrator's row first (it stamps `redacted_by_id`).
 */
import { sql } from '@payloadcms/db-postgres'
import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { advanceReadMarker, type ReadRange } from '../lib/discussions'
import { isForumEnabled } from '../lib/systemFlags'
import { rowsOf } from '../lib/txDb'
import type { User } from '../payload-types'
import { moderate, noRowsReason, routeId } from './moderate'
import { assertSiteAdmin, json, MAX_CONTROL_BODY_BYTES, readJsonBody } from './respond'

const requireForumOn = async (req: PayloadRequest): Promise<void> => {
  if (!(await isForumEnabled(req))) throw new APIError('Discussions are switched off.', 403)
}

// ─── Mark read ─────────────────────────────────────────────────────────────────────────────────────

/** Validate a mark-read body. Throws 400 on anything but two whole numbers with `0 ≤ from ≤ through`. */
export function parseReadRange(raw: unknown): ReadRange {
  const { fromSeq, throughSeq } = (raw ?? {}) as Record<string, unknown>
  const whole = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  if (!whole(fromSeq) || !whole(throughSeq) || fromSeq > throughSeq) {
    throw new APIError(
      'fromSeq and throughSeq must be whole numbers with 0 ≤ fromSeq ≤ throughSeq.',
      400,
    )
  }
  return { fromSeq, throughSeq }
}

export const markReadEndpoint: Endpoint = {
  path: '/:id/mark-read',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    if (!req.user) throw new APIError('Unauthorized', 401)
    await requireForumOn(req)
    const topicId = routeId(req)
    const range = parseReadRange(await readJsonBody(req, MAX_CONTROL_BODY_BYTES))

    const result = await advanceReadMarker(req, {
      userId: (req.user as User).id,
      topicId,
      ...range,
    })
    if (!result) throw new APIError('This discussion no longer exists.', 404)
    // `lastSeq` only grows, so a range past it can only be forged — refused, and nothing was written.
    if (range.throughSeq > result.lastSeq) {
      throw new APIError('throughSeq is ahead of this discussion — reload and try again.', 400)
    }
    return json({ ok: true, lastReadSeq: result.lastReadSeq })
  },
}

// ─── Pin ───────────────────────────────────────────────────────────────────────────────────────────

export const pinEndpoint: Endpoint = {
  path: '/:id/pin',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    await requireForumOn(req)
    const topicId = routeId(req)
    const body = (await readJsonBody<{ pinned?: unknown }>(req, MAX_CONTROL_BODY_BYTES)) ?? {}
    if (typeof body.pinned !== 'boolean') throw new APIError('pinned must be true or false.', 400)

    // A system field through the ordinary update (`rejectContentEdits` lets it pass), inside `moderate`.
    // ⚑ NOT A BARE `payload.update` (review 2026-10-10). Payload's update reads the document and then
    // writes it back WHOLE; outside the topic lock, a redaction or reply committed in between was
    // overwritten with the older values — redacted text restored, `lastSeq` rolled back so the next
    // reply hit a duplicate seq. `moderate` takes the topic lock BEFORE Payload reads, and re-checks
    // the caller after the wait. Pinning stamps no user, so it takes no lock on the caller's row.
    // Re-pinning moves a topic to the top of the pins (most recently pinned first, §16.2).
    let pinnedAt: string | null = null
    const action = {
      event: body.pinned ? 'discussion_pinned' : 'discussion_unpinned',
      target: { table: 'discussion_topics', id: topicId },
      stampsActor: false,
    } as const
    await moderate(req, action, async () => {
      const topic = await req.payload.update({
        collection: 'discussion-topics',
        id: topicId,
        data: { pinnedAt: body.pinned ? new Date().toISOString() : null },
        depth: 0,
        overrideAccess: true,
        select: { pinnedAt: true },
        req,
      })
      pinnedAt = topic.pinnedAt ?? null
      return { topicId }
    })
    return json({ ok: true, pinnedAt })
  },
}

// ─── Redaction ─────────────────────────────────────────────────────────────────────────────────────

/** Validate a topic redaction body: `{ title?: true, body?: true }`, at least one. */
export function parseTopicRedaction(raw: unknown): { title: boolean; body: boolean } {
  const body = (raw ?? {}) as Record<string, unknown>
  for (const key of Object.keys(body)) {
    if (key !== 'title' && key !== 'body') throw new APIError(`"${key}" cannot be redacted.`, 400)
    if (body[key] !== true) throw new APIError(`"${key}" must be true when present.`, 400)
  }
  const parts = { title: body.title === true, body: body.body === true }
  if (!parts.title && !parts.body) throw new APIError('Choose the title, the post, or both.', 400)
  return parts
}

export const redactTopicEndpoint: Endpoint = {
  path: '/:id/redact',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req)
    const target = { table: 'discussion_topics', id: routeId(req) } as const
    const parts = parseTopicRedaction(await readJsonBody(req, MAX_CONTROL_BODY_BYTES))
    const action = { event: 'discussion_redacted', target, stampsActor: true }
    await moderate(req, action, async (db, adminId) => {
      // Only the requested parts are SET, and each is conditional on not being redacted yet — so it is
      // all-or-nothing: if any requested part is already redacted, nothing changes and it is a 409.
      const set = [sql`"updated_at" = clock_timestamp()`]
      const where = [sql`"id" = ${target.id}`]
      if (parts.title) {
        set.push(
          sql`"title" = ''`,
          sql`"title_redacted_at" = clock_timestamp()`,
          sql`"title_redacted_by_id" = ${adminId}`,
        )
        where.push(sql`"title_redacted_at" IS NULL`)
      }
      if (parts.body) {
        set.push(
          sql`"body" = ''`,
          sql`"redacted_at" = clock_timestamp()`,
          sql`"redacted_by_id" = ${adminId}`,
        )
        where.push(sql`"redacted_at" IS NULL`)
      }
      const [row] = rowsOf(
        await db.execute(sql`
          UPDATE "discussion_topics" SET ${sql.join(set, sql`, `)}
           WHERE ${sql.join(where, sql` AND `)}
          RETURNING "id"`),
      )
      if (!row) throw await noRowsReason(db, target)
      return { topicId: target.id, parts }
    })
    return json({ ok: true })
  },
}

export const redactReplyEndpoint: Endpoint = {
  path: '/:id/redact',
  method: 'post',
  handler: async (req: PayloadRequest): Promise<Response> => {
    assertSiteAdmin(req) // before `routeId`: an anonymous caller gets 401, never a 400 about the id
    const target = { table: 'discussion_replies', id: routeId(req) } as const
    const action = { event: 'discussion_redacted', target, stampsActor: true }
    await moderate(req, action, async (db, adminId) => {
      const [row] = rowsOf(
        await db.execute(sql`
          UPDATE "discussion_replies"
             SET "body" = '', "redacted_at" = clock_timestamp(), "redacted_by_id" = ${adminId},
                 "updated_at" = clock_timestamp()
           WHERE "id" = ${target.id} AND "redacted_at" IS NULL
          RETURNING "topic_id"`),
      )
      if (!row) throw await noRowsReason(db, target)
      return { replyId: target.id, topicId: Number(row.topic_id) }
    })
    return json({ ok: true })
  },
}
