/**
 * Post a topic or reply through Payload's ordinary REST create, exactly like Messages, and turn whatever
 * happens into one of three outcomes the composer can act on (`lib/discussionComposer.ts`).
 *
 * Recovery (§16.4 "Duplicate submissions"): when the answer is lost, or a 400 might be the
 * `(author, submissionKey)` constraint, the composer looks its OWN post up by key. Found means the post
 * landed: go to it. A reply goes to the thread page holding its seq, anchored at it — which, beyond page
 * 1, is a different page from the one the reply box was on.
 */
import { classifyCreateStatus, SESSION_MESSAGE, UNCERTAIN_MESSAGE } from '@/lib/discussionComposer'
import { postHref } from '@/lib/discussionPaging'
import { wireErrorMessage } from '@/lib/wireError'

export type SubmitOutcome =
  | { kind: 'posted'; href: string }
  | { kind: 'uncertain'; message: string }
  | { kind: 'refused'; message: string }

export type PostRequest =
  | {
      kind: 'topic'
      data: { title: string; body: string; refVersion?: number }
    }
  | {
      kind: 'reply'
      topicId: number
      data: { body: string; joinedAtSeq: number; refVersion?: number }
    }

/** Long enough for a slow school connection; past it the result is UNCERTAIN, never assumed failed. */
const TIMEOUT_MS = 30_000

/** Overridable in tests, so a stalled request can be exercised without waiting thirty seconds. */
export interface SubmitOptions {
  timeoutMs?: number
}

const REFUSED = 'That could not be posted.'

const collectionOf = (kind: PostRequest['kind']) =>
  kind === 'topic' ? 'discussion-topics' : 'discussion-replies'

const hrefFor = (req: PostRequest, doc: { id: number; seq?: number }): string =>
  req.kind === 'topic' ? `/discuss/${doc.id}` : postHref(req.topicId, Number(doc.seq))

/**
 * Your own post under `key`, or null when there is none. `undefined` when the lookup itself could not be
 * made — which leaves the outcome as uncertain as it was.
 *
 * ⚑ BOUNDED LIKE THE POST ITSELF (GPT review 2026-10-11). Unbounded, a stalled lookup left the composer
 * on "Posting…" with no Try again; timing out is just another way of not knowing.
 */
async function findOwnPost(
  req: PostRequest,
  key: string,
  authorId: number,
  timeoutMs: number,
): Promise<{ id: number; seq?: number } | null | undefined> {
  const params = new URLSearchParams({
    'where[submissionKey][equals]': key,
    'where[author][equals]': String(authorId),
    depth: '0',
    limit: '1',
    pagination: 'false', // one row at most; skip Payload's COUNT
    'select[seq]': 'true',
  })
  try {
    const res = await fetch(`/api/${collectionOf(req.kind)}?${params}`, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { docs?: { id: number; seq?: number }[] }
    return body.docs?.[0] ?? null
  } catch {
    return undefined
  }
}

export async function submitPost(
  req: PostRequest,
  key: string,
  authorId: number,
  { timeoutMs = TIMEOUT_MS }: SubmitOptions = {},
): Promise<SubmitOutcome> {
  const body = req.kind === 'topic' ? req.data : { topic: req.topicId, ...req.data }
  let res: Response | null = null
  try {
    res = await fetch(`/api/${collectionOf(req.kind)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, submissionKey: key }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    res = null // network failure or timeout: the server may still have written it
  }

  const verdict = res ? classifyCreateStatus(res.status) : 'uncertain'
  if (res && verdict === 'ok') {
    const created = (await res.json().catch(() => null)) as {
      doc?: { id: number; seq?: number }
    } | null
    if (created?.doc) return { kind: 'posted', href: hrefFor(req, created.doc) }
    // Created, but the body was lost: find it rather than claim a failure.
  }
  // A refusal refuses THIS request only; whether it settles an earlier attempt is the composer's call
  // (`discussionComposer.ts`: it never does).
  if (verdict === 'session') return { kind: 'refused', message: SESSION_MESSAGE }
  if (verdict === 'refused') {
    return { kind: 'refused', message: await wireErrorMessage(res!, REFUSED) }
  }

  // ok-without-body, lookup and uncertain all ask the same question: did a post land under this key?
  const found = await findOwnPost(req, key, authorId, timeoutMs)
  if (found) return { kind: 'posted', href: hrefFor(req, found) }
  // A 400 with nothing visible under the key is this request refused. A 409 says a post exists that we
  // cannot see, and a failed lookup proves nothing — both stay uncertain.
  if (found === null && res?.status === 400) {
    return { kind: 'refused', message: await wireErrorMessage(res, REFUSED) }
  }
  return { kind: 'uncertain', message: UNCERTAIN_MESSAGE }
}
