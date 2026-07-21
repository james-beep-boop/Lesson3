import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'
import { findReadablePlan, findReadableVersion } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import { displayTitle } from '@/lib/displayTitle'
import type { Message } from '@/payload-types'
import Composer from './Composer'
import ReplyBox from './ReplyBox'
import MarkShownRead from './MarkShownRead'

/**
 * Messages (SPEC §10) — the flat inbox + compose page. One page, no threads, no per-message
 * routes: received messages render newest-first with their full body inline, so VIEWING the inbox
 * IS reading them. Mark-as-read is a state-changing POST fired from the client after render
 * (`MarkShownRead` → POST /api/messages/mark-read), NOT a write during this GET — CSRF-safe for
 * every browser via the SameSite=Lax cookie (Codex #4, 2026-07-05). The "New" highlights still
 * render this visit and clear on the next load. `?plan=`/`?version=` prefill compose with a lesson
 * link (the lesson page's "Message a colleague" affordance).
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; version?: string; older?: string }>
}) {
  const sp = await searchParams
  // "Show older" widens the window instead of introducing cursor/page state: an inbox is read
  // newest-first, so one widen covers any realistic personal history, and the page stays a plain
  // server render with a shareable URL. `?older=1` is the only state.
  const showingOlder = sp.older === '1'
  const pageSize = showingOlder ? 500 : 100
  const { payload, user } = await requireUser()

  // Compose context from the lesson page — only attached when the plan is real and readable by the
  // SENDER (a bogus/foreign ?plan= just composes without context), and the version link only when it's
  // a readable version that actually BELONGS to the plan (mirroring the server-side validateContextLink
  // guard in Messages.ts, so a stale/manipulated URL can't prefill a broken cross-plan context; a
  // missing/foreign/mismatched version just drops to null). The plan→version fetches are sequential by
  // necessity (the ownership check needs the plan id), but the whole resolution is INDEPENDENT of the
  // inbox/roster batch below, so it runs concurrently with it — one wave, not three.
  const aboutPlanId = sp.plan && Number.isInteger(Number(sp.plan)) ? Number(sp.plan) : null
  const contextPromise = (async () => {
    const aboutPlan = aboutPlanId
      ? await findReadablePlan(payload, { id: String(aboutPlanId), user })
      : null
    let aboutVersionId: number | null = null
    if (aboutPlan && sp.version && Number.isInteger(Number(sp.version))) {
      const version = await findReadableVersion(payload, { id: Number(sp.version), user })
      if (version && relId(version.lessonPlan) === aboutPlan.id) aboutVersionId = version.id
    }
    return aboutPlan
      ? { planId: aboutPlan.id, versionId: aboutVersionId, title: displayTitle(aboutPlan.title ?? 'Lesson plan') }
      : null
  })()

  // The names-only roster for the recipient picker (SPEC §8 as amended: any authenticated user
  // reads display names; email/roles/assignments are field-stripped). Self excluded — the picker
  // is for messaging colleagues.
  const [about, [{ docs: roster }, unread, readMsgs, sent]] = await Promise.all([
    contextPromise,
    Promise.all([
      payload.find({
        collection: 'users',
        where: { id: { not_equals: user.id } },
        overrideAccess: false,
        user,
        depth: 0,
        pagination: false,
        sort: 'name',
        select: { name: true },
      }),
      // UNREAD FIRST, then newest read — fetched as two queries rather than one sort (audit L3-05).
      //
      // The bug this fixes: the nav badge counts EVERY unread message, but the inbox rendered only
      // the newest 100 by date. Unread older than that could never render, so `MarkShownRead` could
      // never mark them, and the badge stayed non-zero FOREVER with nothing the user could click.
      // Fetching unread first makes every unread reachable, so the badge converges monotonically —
      // each visit marks the shown unread read, and the next visit surfaces the next batch. That
      // holds even with more unread than the window.
      //
      // Two queries, not `sort: ['readAt', '-createdAt']`: "nulls first" is the property we need and
      // it is dialect-dependent (Postgres puts NULLs last on ASC), so an explicit split says what we
      // mean and cannot silently inv­ert on a database change.
      payload.find({
        collection: 'messages',
        where: { and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }] },
        overrideAccess: false,
        user,
        depth: 1,
        sort: '-createdAt',
        limit: pageSize,
      }),
      payload.find({
        collection: 'messages',
        where: { and: [{ recipient: { equals: user.id } }, { readAt: { exists: true } }] },
        overrideAccess: false,
        user,
        depth: 1,
        sort: '-createdAt',
        limit: pageSize,
      }),
      payload.find({
        collection: 'messages',
        where: { sender: { equals: user.id } },
        overrideAccess: false,
        user,
        depth: 1,
        sort: '-createdAt',
        limit: pageSize,
      }),
    ]),
  ])

  // Unread first, then read — both newest-first within their group.
  const inbox = [...unread.docs, ...readMsgs.docs]
  /** True when the store holds more than this render shows, so the UI can say so instead of
   *  silently truncating (the previous behaviour, which is how the badge bug stayed invisible). */
  const inboxTruncated = unread.totalDocs + readMsgs.totalDocs > inbox.length
  const sentTruncated = sent.totalDocs > sent.docs.length

  // The unread actually SHOWN this render. Still scoped to what rendered — never a blanket
  // recipient+unread update — so the "New" tags appear this visit and the write cannot be driven
  // cross-site. Because unread are fetched FIRST, this now drains the backlog monotonically.
  const shownUnreadIds = unread.docs.map((m) => m.id)

  return (
    <article className="messages">
      <MarkShownRead ids={shownUnreadIds} />
      {/* Composer renders the page's "Messages" heading with the New-message button inline (the "Lessons"
          nav already covers the former "← All lesson plans" back-link, which was also mislabeled here). */}
      <Composer
        roster={roster.map((u) => ({ id: u.id, name: u.name ?? `User ${u.id}` }))}
        about={about}
      />

      <section className="msg-section" aria-label="Inbox">
        <h2>Inbox</h2>
        {inbox.length === 0 ? (
          <p className="muted">No messages yet.</p>
        ) : (
          <>
            <ul className="msg-list">
              {inbox.map((m) => (
                <MessageCard key={m.id} message={m} direction="in" />
              ))}
            </ul>
            {inboxTruncated && (
              <ShowOlder
                shown={inbox.length}
                total={unread.totalDocs + readMsgs.totalDocs}
                expandable={!showingOlder}
              />
            )}
          </>
        )}
      </section>

      <section className="msg-section" aria-label="Sent">
        <h2>Sent</h2>
        {sent.docs.length === 0 ? (
          <p className="muted">Nothing sent yet.</p>
        ) : (
          <ul className="msg-list">
            {sent.docs.map((m) => (
              <MessageCard key={m.id} message={m} direction="out" />
            ))}
          </ul>
        )}
        {sentTruncated && (
          <ShowOlder shown={sent.docs.length} total={sent.totalDocs} expandable={!showingOlder} />
        )}
      </section>
    </article>
  )
}

/** Truncation notice + widen link. Renders ONLY when the store holds more than we showed, so a
 *  complete inbox stays uncluttered. Says the real numbers rather than hinting, because silent
 *  truncation is what hid the unread-badge bug (L3-05).
 *
 *  `expandable` is false once we are ALREADY on `?older=1`, where the link would point at the page
 *  the user is looking at — a dead control that re-renders the identical 500 rows (flagged in the
 *  2026-07-21 review). Past 500 the widen strategy is simply out of room, so we say so plainly
 *  instead of offering an affordance that does nothing. Lifting that ceiling needs real cursor/page
 *  state, which is tracked as its own task — deliberately not bolted on here as a third fixed
 *  widening, because that just moves the same dead end to 2000. The fallback copy must not send the
 *  user to a search box — the messages page has none. */
function ShowOlder({ shown, total, expandable }: { shown: number; total: number; expandable: boolean }) {
  const truncated = shown < total
  return (
    <p className="muted msg-more">
      Showing {shown} of {total}.{' '}
      {truncated &&
        (expandable ? (
          <Link href="/messages?older=1" prefetch={false}>
            Show older messages
          </Link>
        ) : (
          <>Older messages aren&rsquo;t reachable yet.</>
        ))}
    </p>
  )
}

/** One flat message row. `direction` picks whose name heads the card (sender for inbox rows,
 *  recipient for sent rows). The lesson link renders from the depth-1 population — access-gated
 *  for the READER, so an unreadable link just falls back to the bare id-less label. */
function MessageCard({ message: m, direction }: { message: Message; direction: 'in' | 'out' }) {
  const counterpart = direction === 'in' ? m.sender : m.recipient
  const name =
    typeof counterpart === 'object' && counterpart !== null
      ? (counterpart.name ?? 'A user')
      : 'A user'
  const isNew = direction === 'in' && !m.readAt
  const senderId = relId(m.sender)
  const planId = relId(m.lessonPlan)
  const versionId = relId(m.version)
  const planTitle =
    m.lessonPlan && typeof m.lessonPlan === 'object' ? (m.lessonPlan.title ?? 'Lesson plan') : null
  const when = new Date(m.createdAt).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <li className={`msg${isNew ? ' msg--unread' : ''}`}>
      <p className="msg-meta">
        {direction === 'in' ? 'From' : 'To'} <strong>{name}</strong> · {when}
        {isNew && <span className="msg-new-tag">New</span>}
      </p>
      <p className="msg-body">{m.body}</p>
      {planId != null && planTitle != null && (
        <p className="msg-link">
          <Link href={`/lessons/${planId}${versionId != null ? `?version=${versionId}` : ''}`}>
            {displayTitle(planTitle)}
          </Link>
        </p>
      )}
      {direction === 'in' && senderId != null && (
        <ReplyBox
          recipientId={senderId}
          recipientName={name}
          planId={planId}
          versionId={versionId}
        />
      )}
    </li>
  )
}
