/**
 * The composers' submission state (`docs/DESIGN-discussions-2026-10-09.md` §16.4 "Duplicate submissions"
 * and the 4a contract). Pure, so the rules below are unit-tested rather than trusted to a component.
 *
 * ⚑ THE KEY TRAVELS WITH ITS CONTENT (GPT review 2026-10-10). After an UNCERTAIN result — the request may
 * or may not have landed — the fields lock, and the only way on is **Try again**, which re-sends the very
 * same content under the very same key. Either way that is safe: if the first attempt landed, the retry
 * hits the `(author, submissionKey)` constraint and the composer recovers the post; if it did not, the
 * retry is the post. Editing while keeping the key could "recover" the earlier post and silently drop the
 * edit; editing under a NEW key could duplicate a post that did land. So nothing is editable until the
 * outcome is known.
 *
 * ⚑ ONLY A POST SETTLES AN UNCERTAIN ATTEMPT (GPT reviews 2026-10-11). A refusal of a RETRY proves only
 * that the retry wrote nothing — the first attempt may still have committed. That holds for every status,
 * not just 401/403/429: a 400 can turn on server state that changed in between (the referenced version was
 * deleted), and an empty lookup shows only that nothing is visible YET. So the rule infers nothing from
 * status codes:
 *
 *   - nothing unresolved: a definite refusal unlocks the fields and keeps the key (nothing was written);
 *   - an earlier attempt unresolved: any refusal keeps the original content and key locked;
 *   - a successful create, or a lookup that finds the post, resolves it.
 *
 * Locked is not lost: the text stays on screen to copy, and Try again stays available.
 */

/**
 * A fresh submission key: 32 hex characters (128 random bits), inside the server's 16–64 `[A-Za-z0-9-]` rule.
 *
 * ⚑ NOT `crypto.randomUUID()`. Browsers expose it only in a SECURE CONTEXT (HTTPS or localhost), and a
 * Rock on a school LAN serves plain HTTP, so it is `undefined` there and every composer crashed on open
 * (found by the 4a e2e run against `http://app:3000`). `crypto.getRandomValues` is available in every
 * context.
 */
export function newSubmissionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export type ComposerPhase = 'editing' | 'sending' | 'uncertain'

export interface ComposerState {
  phase: ComposerPhase
  key: string
  /** An earlier attempt under this key may have landed, and nothing has settled it yet. */
  unresolved: boolean
  /** What the last attempt said, shown beside the buttons. */
  message: string | null
}

export type ComposerEvent =
  | { type: 'submit' }
  | { type: 'posted' }
  | { type: 'uncertain'; message: string }
  | { type: 'refused'; message: string }

export const initialComposerState = (key: string = newSubmissionKey()): ComposerState => ({
  phase: 'editing',
  key,
  unresolved: false,
  message: null,
})

/** The fields may change only while editing — never in flight, never while the outcome is unknown. */
export const fieldsLocked = (state: ComposerState): boolean => state.phase !== 'editing'

/**
 * `posted` takes a FRESH key (the next post from this open composer is a new one); every other
 * transition keeps the key, because the content it belongs to has not been posted — or might have been.
 */
export function composerReducer(
  state: ComposerState,
  event: ComposerEvent,
  freshKey: () => string = newSubmissionKey,
): ComposerState {
  switch (event.type) {
    case 'submit':
      return state.phase === 'sending' ? state : { ...state, phase: 'sending', message: null }
    case 'posted':
      return initialComposerState(freshKey())
    case 'uncertain':
      return { ...state, phase: 'uncertain', unresolved: true, message: event.message }
    case 'refused':
      // A refusal settles nothing that was already unresolved (see the header).
      return state.unresolved
        ? { ...state, phase: 'uncertain', message: event.message }
        : { ...state, phase: 'editing', unresolved: false, message: event.message }
  }
}

/**
 * How to read a create response's status.
 *
 *   ok        — created;
 *   lookup    — 409 is the server's own "This was already posted" (`hooks/discussions.ts`); a 400 may be the
 *               `(author, submissionKey)` index itself, if two attempts raced past that check. Either way an
 *               earlier attempt may have landed, so the composer looks its post up by key before concluding
 *               anything. (It does not read the error's `data` to tell: the Next.js 16.4 minifier stripped
 *               exactly that, DECISIONS 2026-10-08.)
 *   uncertain — the server failed or the answer never arrived: it may or may not have written;
 *   session   — 401/403: signed out, or the forum was switched off; nothing was written;
 *   refused   — anything else definite (the 429 daily cap, an oversized body): nothing was written.
 */
export function classifyCreateStatus(
  status: number,
): 'ok' | 'lookup' | 'uncertain' | 'session' | 'refused' {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 400 || status === 409) return 'lookup'
  if (status === 401 || status === 403) return 'session'
  if (status >= 500 || status === 408) return 'uncertain'
  return 'refused'
}

export const UNCERTAIN_MESSAGE =
  'We could not tell whether that was posted. Try again — it will not post twice.'
/**
 * ⚑ NOT "reload — your text is still here" (GPT review 2026-10-11). The text lives only in this form's
 * memory (never in browser storage, SPEC §13), so reloading or signing in again loses it. Say so.
 */
export const SESSION_MESSAGE =
  'You can’t post right now: your session may have ended, or discussions were switched off. Your text is only in this form — copy it before you reload or sign in again.'
