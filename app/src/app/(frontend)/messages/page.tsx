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
  searchParams: Promise<{ plan?: string; version?: string }>
}) {
  const sp = await searchParams
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
  const [about, [{ docs: roster }, received, sent]] = await Promise.all([
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
      // depth 1 populates the counterpart's name (roster read) and the linked plan/version labels,
      // under the READER's access. Newest 100 each — plenty for a flat personal inbox; pagination
      // joins the Manage-at-scale backlog if real usage ever nears it.
      payload.find({
        collection: 'messages',
        where: { recipient: { equals: user.id } },
        overrideAccess: false,
        user,
        depth: 1,
        sort: '-createdAt',
        limit: 100,
      }),
      payload.find({
        collection: 'messages',
        where: { sender: { equals: user.id } },
        overrideAccess: false,
        user,
        depth: 1,
        sort: '-createdAt',
        limit: 100,
      }),
    ]),
  ])

  // The unread messages actually SHOWN this render — scoped to the fetched page (not a blanket
  // recipient+unread), so unread beyond the page limit stay unread until pagination surfaces them
  // (the Manage-at-scale backlog). Marked read by the client POST below (MarkShownRead), never during
  // this GET — so the "New" tags render this visit and the write can't be driven cross-site.
  const shownUnreadIds = received.docs.filter((m) => !m.readAt).map((m) => m.id)

  return (
    <article className="messages">
      <MarkShownRead ids={shownUnreadIds} />
      <Link href="/" className="back-link">
        ← All lesson plans
      </Link>
      <h1>Messages</h1>

      <Composer
        roster={roster.map((u) => ({ id: u.id, name: u.name ?? `User ${u.id}` }))}
        about={about}
      />

      <section className="msg-section" aria-label="Inbox">
        <h2>Inbox</h2>
        {received.docs.length === 0 ? (
          <p className="muted">No messages yet.</p>
        ) : (
          <ul className="msg-list">
            {received.docs.map((m) => (
              <MessageCard key={m.id} message={m} direction="in" />
            ))}
          </ul>
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
      </section>
    </article>
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
