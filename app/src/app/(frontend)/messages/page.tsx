import React from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'

import { requireUser } from '@/lib/session'
import { findReadablePlan } from '@/lib/readBundle'
import { relId } from '@/lib/relId'
import type { Message } from '@/payload-types'
import Composer from './Composer'

/**
 * Messages (SPEC §10) — the flat inbox + compose page. One page, no threads, no per-message
 * routes: received messages render newest-first with their full body inline, so VIEWING the inbox
 * IS reading them — every unread message shown is marked read after the list is captured (the
 * "New" highlights still render this once; the AppNav badge clears on the next page load).
 * Mark-as-read is this system write (overrideAccess): the collection's API update path stays
 * closed. `?plan=`/`?version=` prefill compose with a lesson link (the lesson page's
 * "Message a colleague" affordance).
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; version?: string }>
}) {
  const sp = await searchParams
  const { payload, user } = await requireUser()

  // Compose context from the lesson page — only attached when the plan is real and readable by
  // the SENDER (a bogus/foreign ?plan= just composes without context).
  const aboutPlanId = sp.plan && Number.isInteger(Number(sp.plan)) ? Number(sp.plan) : null
  const aboutPlan = aboutPlanId ? await findReadablePlan(payload, { id: String(aboutPlanId), user }) : null
  const about = aboutPlan
    ? {
        planId: aboutPlan.id,
        versionId: sp.version && Number.isInteger(Number(sp.version)) ? Number(sp.version) : null,
        title: aboutPlan.title ?? 'Lesson plan',
      }
    : null

  // The names-only roster for the recipient picker (SPEC §8 as amended: any authenticated user
  // reads display names; email/roles/assignments are field-stripped). Self excluded — the picker
  // is for messaging colleagues.
  const [{ docs: roster }, received, sent] = await Promise.all([
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
  ])

  // Mark everything just shown as read — AFTER capturing the docs above, so this render still
  // highlights what was new. System write; recipient-scoped by the where.
  //
  // Guard: a GET render must not be weaponizable from another origin. `Sec-Fetch-Site: cross-site`
  // is sent ONLY for navigations a different origin initiated (a link/redirect/script from evil.com),
  // so skipping the write in that case blocks a malicious page from silently clearing a logged-in
  // user's unread state (Codex audit 2026-07-03). Genuine in-app clicks (`same-origin`/`same-site`),
  // typed URLs and bookmarks (`none`), and browsers that omit the header all still mark read — the
  // "viewing is reading" UX is unchanged for every normal case. No /read endpoint is reintroduced.
  const secFetchSite = (await headers()).get('sec-fetch-site')
  const hasUnread = received.docs.some((m) => !m.readAt)
  if (hasUnread && secFetchSite !== 'cross-site') {
    await payload.update({
      collection: 'messages',
      where: { and: [{ recipient: { equals: user.id } }, { readAt: { exists: false } }] },
      data: { readAt: new Date().toISOString() },
      overrideAccess: true,
    })
  }

  return (
    <article className="messages">
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
            {planTitle}
          </Link>
        </p>
      )}
    </li>
  )
}
