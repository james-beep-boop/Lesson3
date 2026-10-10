/**
 * The composers' submission rules (`src/lib/discussionComposer.ts`, `components/Discussions/submitPost.ts`;
 * §16.4 "Duplicate submissions" and the 4a contract).
 *
 * ⚑ THE LOAD-BEARING CASES (GPT review 2026-10-10): after an UNCERTAIN result the fields lock and the key
 * is kept — the retry re-sends the same content under the same key; a definite refusal unlocks and keeps
 * the key; only a successful post takes a fresh key. A lost answer or a 400 is checked against the
 * caller's own post by key before anything is concluded, and a recovered reply beyond page 1 is reached on
 * its own page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  classifyCreateStatus,
  composerReducer,
  fieldsLocked,
  initialComposerState,
  newSubmissionKey,
  SESSION_MESSAGE,
  UNCERTAIN_MESSAGE,
} from '../../src/lib/discussionComposer.js'
import { submitPost, type PostRequest } from '../../src/components/Discussions/submitPost.js'

describe('composerReducer', () => {
  const start = initialComposerState('key-aaaaaaaaaaaaaaaa')
  const fresh = () => 'key-bbbbbbbbbbbbbbbb'

  it('locks while sending and while the outcome is uncertain, keeping the key', () => {
    const sending = composerReducer(start, { type: 'submit' })
    expect(fieldsLocked(sending)).toBe(true)
    const uncertain = composerReducer(sending, { type: 'uncertain', message: 'x' })
    expect(fieldsLocked(uncertain)).toBe(true)
    expect(uncertain.key).toBe(start.key)
    // Try again goes back through `submit` — same key.
    expect(composerReducer(uncertain, { type: 'submit' }).key).toBe(start.key)
  })

  it('with nothing unresolved, a refusal unlocks and keeps the key; a post takes a fresh one', () => {
    const refused = composerReducer(composerReducer(start, { type: 'submit' }), {
      type: 'refused',
      message: 'no',
    })
    expect(fieldsLocked(refused)).toBe(false)
    expect(refused.key).toBe(start.key)
    expect(refused.message).toBe('no')
    const posted = composerReducer(refused, { type: 'posted' }, fresh)
    expect(posted).toEqual({ phase: 'editing', key: fresh(), unresolved: false, message: null })
  })

  // ⚑ GPT reviews 2026-10-11: a refusal of the RETRY proves only that the retry wrote nothing — for any
  // status, since a 400 can turn on state that changed in between. Nothing is inferred from status codes.
  it('no refusal settles an unresolved attempt; only a post does', () => {
    const uncertain = composerReducer(composerReducer(start, { type: 'submit' }), {
      type: 'uncertain',
      message: 'unknown',
    })
    let state = uncertain
    for (const message of ['session ended', 'daily cap', 'A title is required.', 'too large']) {
      state = composerReducer(composerReducer(state, { type: 'submit' }), {
        type: 'refused',
        message,
      })
      expect(state.phase, message).toBe('uncertain')
      expect(fieldsLocked(state), message).toBe(true)
      expect(state.message).toBe(message)
      expect(state.key).toBe(start.key)
    }
    const posted = composerReducer(state, { type: 'posted' }, fresh)
    expect(posted).toEqual({ phase: 'editing', key: fresh(), unresolved: false, message: null })
  })

  it('a second submit while sending changes nothing', () => {
    const sending = composerReducer(start, { type: 'submit' })
    expect(composerReducer(sending, { type: 'submit' })).toBe(sending)
  })
})

describe('newSubmissionKey', () => {
  // ⚑ `crypto.randomUUID` exists only in a secure context; a Rock on a school LAN is plain HTTP, and the
  // composers crashed on open there (4a e2e, 2026-10-11). The key must not need it.
  it('mints 32 hex characters without crypto.randomUUID', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const key = newSubmissionKey()
      expect(key).toMatch(/^[0-9a-f]{32}$/)
      expect(newSubmissionKey()).not.toBe(key)
    } finally {
      delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID
    }
    expect(typeof globalThis.crypto.randomUUID).toBe('function')
  })
})

describe('classifyCreateStatus', () => {
  it('reads each status as the composer must act on it', () => {
    expect(
      [201, 400, 401, 403, 408, 409, 413, 429, 500, 502].map((s) => [s, classifyCreateStatus(s)]),
    ).toEqual([
      [201, 'ok'],
      [400, 'lookup'],
      [401, 'session'],
      [403, 'session'],
      [408, 'uncertain'],
      [409, 'lookup'],
      [413, 'refused'],
      [429, 'refused'],
      [500, 'uncertain'],
      [502, 'uncertain'],
    ])
  })
})

describe('submitPost', () => {
  afterEach(() => vi.unstubAllGlobals())

  const reply: PostRequest = { kind: 'reply', topicId: 5, data: { body: 'Hi', joinedAtSeq: 72 } }
  const topic: PostRequest = { kind: 'topic', data: { title: 'T', body: 'B' } }
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  /** `fetch` answering the create with `create`, then the by-key lookup with `lookup`. */
  function stubFetch(create: () => Promise<Response>, lookup?: () => Promise<Response>) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' ? create() : lookup ? lookup() : json(500, {}),
    )
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('sends the key with the content and goes to the new topic', async () => {
    const fetchMock = stubFetch(async () => json(201, { doc: { id: 9 } }))
    expect(await submitPost(topic, 'key-1234567890abcdef', 7)).toEqual({
      kind: 'posted',
      href: '/discuss/9',
    })
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent).toEqual({ title: 'T', body: 'B', submissionKey: 'key-1234567890abcdef' })
  })

  it('recovers a reply that landed although the answer was lost — on its own page', async () => {
    const fetchMock = stubFetch(
      async () => {
        throw new TypeError('network')
      },
      async () => json(200, { docs: [{ id: 40, seq: 73 }] }),
    )
    expect(await submitPost(reply, 'key-1234567890abcdef', 7)).toEqual({
      kind: 'posted',
      href: '/discuss/5?page=2#reply-73',
    })
    const lookupUrl = String(fetchMock.mock.calls[1][0])
    expect(lookupUrl).toContain('where%5BsubmissionKey%5D%5Bequals%5D=key-1234567890abcdef')
    expect(lookupUrl).toContain('where%5Bauthor%5D%5Bequals%5D=7')
  })

  it('stays uncertain when the post is not found, or the lookup fails too', async () => {
    stubFetch(
      async () => json(502, {}),
      async () => json(200, { docs: [] }),
    )
    expect(await submitPost(reply, 'k'.repeat(20), 7)).toEqual({
      kind: 'uncertain',
      message: UNCERTAIN_MESSAGE,
    })
    stubFetch(
      async () => {
        throw new TypeError('network')
      },
      async () => {
        throw new TypeError('still down')
      },
    )
    expect((await submitPost(reply, 'k'.repeat(20), 7)).kind).toBe('uncertain')
  })

  it('a 400 under a key that already posted is that post; otherwise the server’s refusal', async () => {
    stubFetch(
      async () => json(400, { errors: [{ message: 'Value must be unique' }] }),
      async () => json(200, { docs: [{ id: 12 }] }),
    )
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'posted',
      href: '/discuss/12',
    })
    stubFetch(
      async () => json(400, { errors: [{ message: 'A title is required.' }] }),
      async () => json(200, { docs: [] }),
    )
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'refused',
      message: 'A title is required.',
    })
  })

  // ⚑ GPT review 2026-10-11: 409 is what the server ACTUALLY answers for a repeated key.
  it('a 409 is the earlier attempt: found by key, or still uncertain — never a refusal', async () => {
    stubFetch(
      async () => json(409, { errors: [{ message: 'This was already posted.' }] }),
      async () => json(200, { docs: [{ id: 31 }] }),
    )
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'posted',
      href: '/discuss/31',
    })
    stubFetch(
      async () => json(409, { errors: [{ message: 'This was already posted.' }] }),
      async () => json(200, { docs: [] }),
    )
    expect((await submitPost(topic, 'k'.repeat(20), 7)).kind).toBe('uncertain')
  })

  it('the sequence: answer lost and lookup down, then Try again meets 409 and finds the post', async () => {
    stubFetch(
      async () => {
        throw new TypeError('network')
      },
      async () => {
        throw new TypeError('lookup down too')
      },
    )
    expect((await submitPost(topic, 'k'.repeat(20), 7)).kind).toBe('uncertain')
    stubFetch(
      async () => json(409, { errors: [{ message: 'This was already posted.' }] }),
      async () => json(200, { docs: [{ id: 44 }] }),
    )
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'posted',
      href: '/discuss/44',
    })
  })

  it('a stalled lookup times out as uncertain instead of hanging on "Posting…"', async () => {
    // The lookup never answers on its own on its own; the request's abort signal is what must end the wait.
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? Promise.resolve(json(502, {}))
          : new Promise<Response>((_, reject) =>
              init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)),
            ),
      ),
    )
    expect(await submitPost(topic, 'k'.repeat(20), 7, { timeoutMs: 20 })).toEqual({
      kind: 'uncertain',
      message: UNCERTAIN_MESSAGE,
    })
  })

  it('refuses plainly on a session or switch problem, and on the daily cap', async () => {
    stubFetch(async () => json(403, { errors: [{ message: 'Forbidden' }] }))
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'refused',
      message: SESSION_MESSAGE,
    })
    stubFetch(async () => json(429, { errors: [{ message: 'You have reached today’s limit.' }] }))
    expect(await submitPost(topic, 'k'.repeat(20), 7)).toEqual({
      kind: 'refused',
      message: 'You have reached today’s limit.',
    })
  })
})
