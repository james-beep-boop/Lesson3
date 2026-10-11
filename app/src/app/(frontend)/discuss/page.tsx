import React from 'react'
import Link from 'next/link'

import Pager from '@/components/Discussions/Pager'
import PageHeader from '@/components/PageHeader'
import { postTime } from '@/components/Discussions/PostText'
import { MAX_SEARCH_LENGTH } from '@/lib/discussions'
import {
  listPageParam,
  listTopics,
  requireForum,
  searchTopics,
  type TopicListPage,
  type TopicRow,
} from '@/lib/discussionPages'
import { plural } from '@/lib/plural'
import { requireUser } from '@/lib/session'

/**
 * Discussions (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 4a): title search, Start a discussion, the
 * pinned block, then topics by latest activity, 20 a page. A plain server render — the search is an
 * ordinary GET form and pages are links, so the URL is the whole state.
 */
export default async function DiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string }>
}) {
  const { payload, user } = await requireUser()
  const forumEnabled = await requireForum(payload, user)
  const sp = await searchParams
  // Repeated query parameters arrive as an array, not the scalar submitted by the search form.
  const query =
    forumEnabled && typeof sp.q === 'string' ? sp.q.slice(0, MAX_SEARCH_LENGTH).trim() : ''
  const page = listPageParam(sp.page)

  return (
    <article className="disc">
      {!forumEnabled && (
        <p className="disc-notice" role="status">
          Discussions are switched off. You can redact posts and delete threads here.
        </p>
      )}
      <PageHeader
        title="Discussions"
        actions={
          forumEnabled && (
            <Link href="/discuss/new" className="btn btn--primary">
              Start a discussion
            </Link>
          )
        }
      />
      {forumEnabled && (
        <form className="disc-search" action="/discuss" method="get" role="search">
          <label htmlFor="disc-q" className="visually-hidden">
            Search discussion titles
          </label>
          <input
            id="disc-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search discussion titles"
            maxLength={MAX_SEARCH_LENGTH}
          />
          <button type="submit" className="btn">
            Search
          </button>
          {query && (
            <Link href="/discuss" className="btn btn--quiet">
              Clear
            </Link>
          )}
        </form>
      )}
      {query ? (
        <SearchResults query={query} results={await searchTopics(payload, user, query, page)} />
      ) : (
        <TopicList list={await listTopics(payload, user, page)} forumEnabled={forumEnabled} />
      )}
    </article>
  )
}

function SearchResults({
  query,
  results,
}: {
  query: string
  results: Awaited<ReturnType<typeof searchTopics>>
}) {
  if (!results || results.rows.length === 0) {
    return (
      <p className="muted disc-empty">
        No discussion titles match “{query}”. Search looks at titles only.
      </p>
    )
  }
  return (
    <section aria-label="Search results">
      <p className="muted">
        {plural(results.total, 'discussion')} with “{query}” in the title, newest activity first.
      </p>
      <TopicRows rows={results.rows} />
      <Pager
        page={results.page}
        totalPages={results.totalPages}
        href={(p) => `/discuss?${new URLSearchParams({ q: query, page: String(p) })}`}
        label="Result pages"
      />
    </section>
  )
}

function TopicList({ list, forumEnabled }: { list: TopicListPage; forumEnabled: boolean }) {
  if (list.page === 1 && list.pinned.length === 0 && list.rows.length === 0) {
    return (
      <div className="disc-empty">
        <p>No discussions yet.</p>
        {forumEnabled && (
          <p className="muted">
            Ask a question about a lesson, or tell colleagues what you changed and why. Everyone
            signed in can read and reply.
          </p>
        )}
        {forumEnabled && (
          <Link href="/discuss/new" className="btn btn--primary">
            Start the first discussion
          </Link>
        )}
      </div>
    )
  }
  return (
    <>
      {list.pinned.length > 0 && (
        <section aria-labelledby="disc-pinned">
          <h2 id="disc-pinned" className="disc-section-title">
            Pinned
          </h2>
          <TopicRows rows={list.pinned} />
        </section>
      )}
      <section aria-labelledby="disc-latest">
        <h2 id="disc-latest" className="disc-section-title">
          Latest activity
        </h2>
        {list.rows.length === 0 ? (
          <p className="muted">No more discussions.</p>
        ) : (
          <TopicRows rows={list.rows} />
        )}
      </section>
      <Pager
        page={list.page}
        totalPages={list.totalPages}
        href={(p) => `/discuss?page=${p}`}
        label="Pages"
      />
    </>
  )
}

function TopicRows({ rows }: { rows: TopicRow[] }) {
  return (
    <ul className="disc-list">
      {rows.map((row) => (
        <li key={row.id} className={`disc-row${row.unread ? ' disc-row--unread' : ''}`}>
          <p className="disc-row__title">
            {row.unread && (
              <>
                <span className="disc-dot" aria-hidden="true" />
                <span className="visually-hidden">Unread posts: </span>
              </>
            )}
            <Link href={`/discuss/${row.id}`}>
              {row.title ?? <em>Title removed by the administrator</em>}
            </Link>
          </p>
          <p className="disc-row__meta">
            Started by {row.authorName} · {row.replyCount}{' '}
            {row.replyCount === 1 ? 'reply' : 'replies'} · active {postTime(row.lastActivityAt)}
            {row.refLabel && <> · {row.refLabel}</>}
          </p>
        </li>
      ))}
    </ul>
  )
}
