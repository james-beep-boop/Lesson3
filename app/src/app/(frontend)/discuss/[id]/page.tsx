import React from 'react'
import { notFound } from 'next/navigation'

import MarkThreadRead from '@/components/Discussions/MarkThreadRead'
import ModerationControls from '@/components/Discussions/ModerationControls'
import { isSiteAdmin } from '@/access'
import { PostReference, PostText, postTime } from '@/components/Discussions/PostText'
import ReplyComposer from '@/components/Discussions/ReplyComposer'
import Pager from '@/components/Discussions/Pager'
import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import { markRangeFor, postAnchor } from '@/lib/discussionPaging'
import { loadThread, requireForum, type PostView } from '@/lib/discussionPages'
import { relId } from '@/lib/relId'
import { requireUser } from '@/lib/session'

/**
 * One discussion: the opening post, then replies oldest to newest, 50 a page (§16.5, 4a).
 *
 * With no `?page=` it opens at the page holding the viewer's first unread post (`entryPage`). After
 * render, `MarkThreadRead` marks exactly the range this page displayed — the opening post only on page 1 —
 * so a page opened out of order marks nothing the reader skipped.
 */
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { payload, user } = await requireUser()
  const forumEnabled = await requireForum(payload, user)
  const moderator = isSiteAdmin(user)
  const topicId = relId((await params).id)
  if (topicId == null) notFound()
  const thread = await loadThread(payload, user, topicId, (await searchParams).page, forumEnabled)
  // Only a participant has a marker to move, and only when this page shows something past it — so
  // revisiting a thread you have read sends nothing.
  const range = thread.lastReadSeq == null ? null : markRangeFor(thread.page, thread.lastSeq)
  const markRange = range && thread.lastReadSeq! < range.throughSeq ? range : null
  const pageHref = (p: number) => `/discuss/${thread.id}?page=${p}`

  return (
    <article className="disc disc-thread">
      {!forumEnabled && (
        <p className="disc-notice" role="status">
          Discussions are switched off. You can redact posts and delete threads here.
        </p>
      )}
      {markRange && <MarkThreadRead topicId={thread.id} {...markRange} />}
      <PageHeader
        title={thread.title ?? <em>Title removed by the administrator</em>}
        actions={<PageBackLink href="/discuss" label="Back to discussions" />}
      />
      {moderator && (
        <ModerationControls
          key={`topic-${thread.id}-${thread.pinned}-${thread.title === null}-${thread.opening.body === null}`}
          target={{
            kind: 'topic',
            id: thread.id,
            pinned: thread.pinned,
            titleRemoved: thread.title === null,
            forumEnabled,
          }}
          bodyRemoved={thread.opening.body === null}
        />
      )}
      <Post post={thread.opening} opening />
      <Pager
        page={thread.page}
        totalPages={thread.totalPages}
        href={pageHref}
        label="Reply pages"
      />
      {thread.replies.length > 0 && (
        <ol className="disc-replies" aria-label="Replies">
          {thread.replies.map((reply) => (
            <li key={reply.seq}>
              <Post post={reply} />
              {moderator && (
                <ModerationControls
                  key={`reply-${reply.id}-${reply.body === null}`}
                  target={{ kind: 'reply', id: reply.id }}
                  bodyRemoved={reply.body === null}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      <Pager
        page={thread.page}
        totalPages={thread.totalPages}
        href={pageHref}
        label="Reply pages"
      />
      {forumEnabled && (
        <ReplyComposer authorId={user.id} topicId={thread.id} joinedAtSeq={thread.lastSeq} />
      )}
    </article>
  )
}

function Post({ post, opening = false }: { post: PostView; opening?: boolean }) {
  return (
    <section
      id={postAnchor(post.seq)}
      className={`disc-post${opening ? ' disc-post--opening' : ''}`}
      aria-label={opening ? 'Opening post' : `Reply by ${post.authorName}`}
    >
      <p className="disc-post__meta">
        <strong>{post.authorName}</strong> · {postTime(post.createdAt)}
      </p>
      {post.body == null ? (
        <p className="disc-post__removed">Removed by the administrator</p>
      ) : (
        <PostText text={post.body} />
      )}
      {post.reference && <PostReference reference={post.reference} />}
    </section>
  )
}
