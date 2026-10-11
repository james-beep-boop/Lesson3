/**
 * The Discussions pages' server reads (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 4a contract).
 *
 * Every read runs AS THE VIEWER (`overrideAccess: false`), so the collections' own access rules — signed
 * in, forum on, or Site Administrator moderation while off — decide what a page may show. Authors are
 * projected names-only. The switch comes from `systemFlagsForRender`, the one reading the page gate, the
 * nav and the unread markers share within a render.
 */
import { notFound } from 'next/navigation'
import type { Payload } from 'payload'

import { isSiteAdmin } from '../access'
import type { DiscussionReply, DiscussionTopic, User } from '../payload-types'
import {
  entryPage,
  pageNumberParam,
  parsePage,
  replyPageCount,
  replySeqsOn,
} from './discussionPaging'
import { searchTopicTitles, TOPIC_PAGE_SIZE, unreadTopicIds } from './discussions'
import { nullOnNotVisible } from './readBundle'
import { distinctIds, relId } from './relId'
import { systemFlagsForRender } from './systemFlags'
import { userDisplayName } from './widgetUser'

/** What a post by a deleted account is attributed to (§16.4 "Account deletion"). */
const DELETED_USER = 'Deleted User'

/**
 * Posting pages always require the forum. Read pages may explicitly opt into the administrator's
 * moderation-only view; the returned flag drives the banner and hides every participation control.
 */
export async function requireForum(payload: Payload, moderator?: User): Promise<boolean> {
  const { forumEnabled } = await systemFlagsForRender(payload)
  if (!forumEnabled && !isSiteAdmin(moderator)) notFound()
  return forumEnabled
}

/** Display names for `ids`, names only, read as the viewer (any signed-in user reads names, SPEC §8). */
async function namesFor(
  payload: Payload,
  user: User,
  ids: (number | null)[],
): Promise<Map<number, string>> {
  const unique = distinctIds(ids)
  if (unique.length === 0) return new Map()
  const { docs } = await payload.find({
    collection: 'users',
    where: { id: { in: unique } },
    overrideAccess: false,
    user,
    depth: 0,
    pagination: false,
    select: { name: true },
  })
  return new Map(docs.map((u) => [u.id, userDisplayName(u)]))
}

const authorName = (names: Map<number, string>, author: unknown): string => {
  const id = relId(author)
  return id == null ? DELETED_USER : (names.get(id) ?? DELETED_USER)
}

// ─── The topic list ────────────────────────────────────────────────────────────────────────────────

export interface TopicRow {
  id: number
  /** Null when the administrator removed the title. */
  title: string | null
  authorName: string
  lastActivityAt: string
  replyCount: number
  refLabel: string | null
  unread: boolean
}

const TOPIC_ROW_SELECT = {
  title: true,
  author: true,
  lastActivityAt: true,
  lastSeq: true,
  refLabel: true,
  titleRedactedAt: true,
} as const

type TopicRowDoc = Pick<
  DiscussionTopic,
  'id' | 'title' | 'author' | 'lastActivityAt' | 'lastSeq' | 'refLabel' | 'titleRedactedAt'
>

async function toTopicRows(payload: Payload, user: User, docs: TopicRowDoc[]): Promise<TopicRow[]> {
  const [names, unread] = await Promise.all([
    namesFor(
      payload,
      user,
      docs.map((d) => relId(d.author)),
    ),
    unreadTopicIds(
      payload,
      user.id,
      docs.map((d) => d.id),
    ),
  ])
  const unreadSet = new Set(unread)
  return docs.map((d) => ({
    id: d.id,
    title: d.titleRedactedAt ? null : (d.title ?? ''),
    authorName: authorName(names, d.author),
    lastActivityAt: String(d.lastActivityAt ?? ''),
    replyCount: Number(d.lastSeq ?? 0), // `lastSeq` IS the reply count (collections/DiscussionTopics)
    refLabel: d.refLabel ?? null,
    unread: unreadSet.has(d.id),
  }))
}

export interface TopicListPage {
  /** Every pinned topic, most recently pinned first — page 1 only. */
  pinned: TopicRow[]
  rows: TopicRow[]
  page: number
  totalPages: number
}

/**
 * The Discussions page: the pinned block, then one page of the rest by latest activity.
 *
 * ⚑ PINS ARE A SEPARATE QUERY, NOT A SORT KEY (GPT review 2026-10-10). Postgres sorts NULLs FIRST in a
 * descending sort, so `sort: '-pinnedAt'` would put every UNpinned topic above the pins, and Payload's
 * `sort` cannot say `NULLS LAST`. So the pins are read on their own (`pinnedAt` exists), and the paginated
 * list excludes them — which also keeps its pages stable when a topic is pinned. Pins are few and chosen
 * by the administrator, so the block is not paginated.
 */
export async function listTopics(
  payload: Payload,
  user: User,
  page: number,
): Promise<TopicListPage> {
  const [pinned, rest] = await Promise.all([
    page === 1
      ? payload.find({
          collection: 'discussion-topics',
          where: { pinnedAt: { exists: true } },
          sort: ['-pinnedAt', '-id'],
          pagination: false,
          depth: 0,
          overrideAccess: false,
          user,
          select: TOPIC_ROW_SELECT,
        })
      : null,
    payload.find({
      collection: 'discussion-topics',
      where: { pinnedAt: { exists: false } },
      sort: ['-lastActivityAt', '-id'],
      limit: TOPIC_PAGE_SIZE,
      page,
      depth: 0,
      overrideAccess: false,
      user,
      select: TOPIC_ROW_SELECT,
    }),
  ])
  const pinnedDocs = (pinned?.docs ?? []) as TopicRowDoc[]
  const rows = await toTopicRows(payload, user, [...pinnedDocs, ...(rest.docs as TopicRowDoc[])])
  return {
    pinned: rows.slice(0, pinnedDocs.length),
    rows: rows.slice(pinnedDocs.length),
    page: rest.page ?? page,
    totalPages: Math.max(1, rest.totalPages),
  }
}

/** Title search results as rows: newest activity first, with NO pin priority (4a contract). */
export async function searchTopics(
  payload: Payload,
  user: User,
  query: string,
  page: number,
): Promise<{ rows: TopicRow[]; page: number; totalPages: number; total: number } | null> {
  const result = await searchTopicTitles(payload, { user, query, page })
  if (!result) return null
  return {
    rows: await toTopicRows(payload, user, result.docs as TopicRowDoc[]),
    page: result.page ?? page,
    totalPages: Math.max(1, result.totalPages),
    total: result.totalDocs,
  }
}

/** A `?page=` for the topic list: a positive whole number, else 1. */
export const listPageParam = (raw: string | undefined): number => pageNumberParam(raw) ?? 1

// ─── References (§16.2) ────────────────────────────────────────────────────────────────────────────

export interface ReferenceView {
  label: string
  /** `/lessons/<plan>?version=<v>`, or null when the version is gone or not readable. */
  lessonHref: string | null
  /** Compare changes, only when the source version is recorded and both are readable now. */
  compareHref: string | null
}

type Referencing = { refVersion?: unknown; refLabel?: string | null }

/**
 * Resolve every reference on a page at once, as the viewer: one read for the referenced versions, one for
 * their sources.
 *
 * ⚑ A NULL OR UNREADABLE `refVersion` GETS NO LINK AT ALL — not a lesson link (which would open the
 * Official version instead) and not Compare changes (GPT review 2026-10-09). The snapshot label still says
 * what it was.
 */
async function resolveReferences(
  payload: Payload,
  user: User,
  posts: Referencing[],
): Promise<(ReferenceView | null)[]> {
  const versionIds = distinctIds(posts.map((p) => relId(p.refVersion)))
  const readable = versionIds.length
    ? (
        await payload.find({
          collection: 'lesson-bundle-versions',
          where: { id: { in: versionIds } },
          overrideAccess: false,
          user,
          depth: 0,
          pagination: false,
          select: { lessonPlan: true, sourceVersion: true },
        })
      ).docs
    : []
  const byId = new Map(readable.map((v) => [v.id, v]))
  const sourceIds = distinctIds(readable.map((v) => relId(v.sourceVersion)))
  const readableSources = new Set(
    sourceIds.length
      ? (
          await payload.find({
            collection: 'lesson-bundle-versions',
            where: { id: { in: sourceIds } },
            overrideAccess: false,
            user,
            depth: 0,
            pagination: false,
            select: { semver: true }, // any one field: only the ids of what is readable matter
          })
        ).docs.map((v) => v.id)
      : [],
  )

  return posts.map((post) => {
    const versionId = relId(post.refVersion)
    if (versionId == null && !post.refLabel) return null
    const label = post.refLabel ?? 'A lesson version'
    const version = versionId == null ? undefined : byId.get(versionId)
    const planId = relId(version?.lessonPlan)
    if (!version || planId == null) return { label, lessonHref: null, compareHref: null }
    const sourceId = relId(version.sourceVersion)
    return {
      label,
      lessonHref: `/lessons/${planId}?version=${version.id}`,
      compareHref:
        sourceId != null && readableSources.has(sourceId)
          ? `/lessons/${planId}/compare?from=${sourceId}&to=${version.id}`
          : null,
    }
  })
}

// ─── The thread ────────────────────────────────────────────────────────────────────────────────────

export interface PostView {
  id: number
  seq: number
  authorName: string
  createdAt: string
  /** Null when the administrator removed it. */
  body: string | null
  reference: ReferenceView | null
}

export interface ThreadView {
  id: number
  title: string | null
  pinned: boolean
  lastSeq: number
  page: number
  totalPages: number
  /** The viewer's marker, or null when they do not take part in this thread. */
  lastReadSeq: number | null
  opening: PostView
  replies: PostView[]
}

/**
 * One page of a thread, as the viewer. 404 when the topic is gone or not readable.
 *
 * Without a valid `?page=`, it opens at the page holding `lastReadSeq + 1` (`entryPage`).
 */
export async function loadThread(
  payload: Payload,
  user: User,
  topicId: number,
  pageParam: string | undefined,
  forumEnabled = true,
): Promise<ThreadView> {
  const [topic, participation] = await Promise.all([
    // ⚑ Only "not there" and "not yours to see" become a 404 (the `readBundle` convention); a database or
    // programming failure propagates rather than masquerading as a missing discussion (GPT review 2026-10-11).
    payload
      .findByID({
        collection: 'discussion-topics',
        id: topicId,
        depth: 0,
        overrideAccess: false,
        user,
      })
      .catch(nullOnNotVisible),
    // Participation is deliberately inaccessible while off, even to an administrator. Moderation
    // starts at page 1 and never changes read markers.
    forumEnabled
      ? payload.find({
          collection: 'discussion-participation',
          where: { topic: { equals: topicId } },
          overrideAccess: false,
          user,
          depth: 0,
          limit: 1,
          pagination: false, // one own row at most; skip Payload's COUNT
          select: { lastReadSeq: true },
        })
      : null,
  ])
  if (!topic) notFound()

  const lastSeq = Number(topic.lastSeq ?? 0)
  const own = participation?.docs[0]
  const lastReadSeq = own ? Number(own.lastReadSeq) : null
  const page = parsePage(pageParam, lastSeq) ?? entryPage(lastReadSeq, lastSeq)
  const seqs = replySeqsOn(page, lastSeq)

  const replies = seqs
    ? ((
        await payload.find({
          collection: 'discussion-replies',
          where: {
            and: [
              { topic: { equals: topicId } },
              { seq: { greater_than_equal: seqs.first } },
              { seq: { less_than_equal: seqs.last } },
            ],
          },
          sort: 'seq',
          pagination: false,
          depth: 0,
          overrideAccess: false,
          user,
        })
      ).docs as DiscussionReply[])
    : []

  const [names, references] = await Promise.all([
    namesFor(payload, user, [relId(topic.author), ...replies.map((r) => relId(r.author))]),
    resolveReferences(payload, user, [topic, ...replies]),
  ])

  return {
    id: topic.id,
    title: topic.titleRedactedAt ? null : (topic.title ?? ''),
    pinned: !!topic.pinnedAt,
    lastSeq,
    page,
    totalPages: replyPageCount(lastSeq),
    lastReadSeq,
    opening: {
      id: topic.id,
      seq: 0,
      authorName: authorName(names, topic.author),
      createdAt: String(topic.createdAt),
      body: topic.redactedAt ? null : (topic.body ?? ''),
      reference: references[0],
    },
    replies: replies.map((r, i) => ({
      id: r.id,
      seq: Number(r.seq),
      authorName: authorName(names, r.author),
      createdAt: String(r.createdAt),
      body: r.redactedAt ? null : (r.body ?? ''),
      reference: references[i + 1],
    })),
  }
}
