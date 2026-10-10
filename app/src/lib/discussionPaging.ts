/**
 * Thread pagination and the read range a page may mark (`docs/DESIGN-discussions-2026-10-09.md` §16.5, 4a
 * contract). Pure arithmetic, shared by the thread page (server) and the composers (browser), and
 * unit-tested at the boundaries.
 *
 * Page `k` holds reply seqs `REPLY_PAGE_SIZE·(k−1)+1 … REPLY_PAGE_SIZE·k`. The opening post is seq 0: it
 * heads every page, but counts as DISPLAYED only on page 1.
 */

/** Replies per thread page (§16.2: raised from 30 so nearly every thread fits on one page). */
export const REPLY_PAGE_SIZE = 50

/** The page holding reply `seq` (seq 0, the opening post, is on page 1). */
export const pageOfSeq = (seq: number): number => Math.max(1, Math.ceil(seq / REPLY_PAGE_SIZE))

/** How many pages a thread with `lastSeq` replies has: the page holding its last reply (at least 1). */
export const replyPageCount = (lastSeq: number): number => pageOfSeq(lastSeq)

/** A `?page=` value as a positive whole number, or null. Shared by the topic list and the thread. */
export const pageNumberParam = (raw: string | undefined): number | null =>
  raw != null && /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : null

/**
 * Where a thread opens when no page is asked for.
 *
 * ⚑ THE PAGE HOLDING `lastReadSeq + 1`, NOT "the next reply by someone else" (GPT review 2026-10-10). The
 * marker is contiguous — mark-read refuses a range that does not follow on from it — so opening past a run
 * of your own unread-marked replies would leave them unmarked, and the marker could never advance past
 * them. A non-participant (`null`) and an invited author at −1 both open page 1. Clamped to the last page:
 * a caller who has read everything lands on the newest replies.
 */
export const entryPage = (lastReadSeq: number | null, lastSeq: number): number =>
  lastReadSeq == null
    ? 1
    : Math.min(replyPageCount(lastSeq), pageOfSeq(Math.max(0, lastReadSeq + 1)))

/** A requested page, or null when it is not a whole number within the thread. */
export function parsePage(raw: string | undefined, lastSeq: number): number | null {
  const page = pageNumberParam(raw)
  return page != null && page <= replyPageCount(lastSeq) ? page : null
}

/** The reply seqs page `page` displays, or null when it holds none (page 1 of a thread with no replies). */
export function replySeqsOn(page: number, lastSeq: number): { first: number; last: number } | null {
  const first = REPLY_PAGE_SIZE * (page - 1) + 1
  const last = Math.min(REPLY_PAGE_SIZE * page, lastSeq)
  return first <= last ? { first, last } : null
}

/**
 * The range a rendered page may mark read: exactly what it displayed, as `mark-read` expects it.
 *
 * Page 1 starts at 0, because it displays the opening post; a later page starts at its first reply, so
 * opening page 3 directly marks nothing the reader skipped — the server refuses a range that does not
 * follow on from the marker, and seeing the opening post at the top of page 3 counts for nothing. Null
 * when a later page has no replies to show.
 */
export function markRangeFor(
  page: number,
  lastSeq: number,
): { fromSeq: number; throughSeq: number } | null {
  const replies = replySeqsOn(page, lastSeq)
  if (page === 1) return { fromSeq: 0, throughSeq: replies?.last ?? 0 }
  return replies ? { fromSeq: replies.first, throughSeq: replies.last } : null
}

/** The anchor id of a post on the thread page: the opening post is `post-0`, a reply `reply-<seq>`. */
export const postAnchor = (seq: number): string => (seq === 0 ? 'post-0' : `reply-${seq}`)

/** Where a post lives: its thread page and anchor. */
export const postHref = (topicId: number, seq: number): string =>
  `/discuss/${topicId}?page=${pageOfSeq(seq)}#${postAnchor(seq)}`
