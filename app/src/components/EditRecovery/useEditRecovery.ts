'use client'

/**
 * `useEditRecovery` — the client half of unsaved-edit durability (design §5).
 *
 * Owns the session: `start` on unlock, a debounced capture while the form is dirty, a flush on blur
 * and before token expiry, and the pre-save sequence. `LessonControls` wires it up and renders the
 * indicator; every fetch to the recovery endpoints lives here.
 *
 * ⚑ **`start` follows the ACTUAL UNLOCK, never the Edit click.** At ≤640px the Edit button opens the
 * narrow-screen dialog and does not unlock, and `?edit=1` is deliberately neutralised on load by the
 * once-on-mount guard. Starting on intent would mint sessions for teachers on phones who cannot type
 * into them, and consume their per-user active-capture cap doing it.
 *
 * ⚑ **NOTHING IS PERSISTED IN THE BROWSER** — no `localStorage`, no `sessionStorage`. That is not an
 * omission; it is what makes matrix case 5 true (a different user on the same browser sees nothing).
 * The server keys every operation on `req.user.id` and gives the client nowhere to name another user;
 * a client-side cache would hand back exactly what that design removed. Shared school machines are the
 * deployment this protects (SPEC §13).
 *
 * ⚑ **One in-flight capture at a time.** Two overlapping captures would send the same
 * `expectedRevision` twice: the first advances it, the second 409s against a conflict it caused
 * itself. `inFlight` is the single-flight guard and the pre-save sequence awaits it before capturing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Registration } from './flushRegistry'
import { captureAnchors } from '../../lib/editRecovery/projection'
import {
  classifyResponse,
  fingerprint,
  offerKind,
  planSave,
  statusForOutcome,
  type CaptureOutcome,
  type OfferedCapture,
  type RecoveryStatus,
  type RecoveryToken,
  type SavePlan,
} from './protocol'

/**
 * Idle debounce before a capture (design §5: "~8 s idle, plus on blur").
 *
 * Exported so `tests/unit/useEditRecovery.spec.tsx` advances the REAL debounce rather than a copy of
 * the number — a copy makes every timing test describe a scenario it no longer exercises the moment
 * this changes.
 */
export const CAPTURE_DEBOUNCE_MS = 8_000

/**
 * How long the entry lookup may take before we give up and let the teacher work.
 *
 * ⚑ Bounded because `resolving` now SUPPRESSES CAPTURE — a read that never answers would otherwise
 * leave the session with no backup at all, silently, for as long as the editor stays open. Giving up
 * is the right failure: not offering a capture back is a much smaller harm than not taking one.
 */
export const ENTRY_LOOKUP_TIMEOUT_MS = 10_000

/**
 * How long one CAPTURE may take before it is abandoned.
 *
 * ⚑ Bounded for a different reason than the lookup above, and a worse one. A capture that never
 * settles holds `inFlight` forever — so every later capture returns that same pending promise and no
 * further backup is ever taken — and `prepareForSave` AWAITS `inFlight`, so the teacher's SAVE waits
 * on it too, until the browser's own network timeout minutes later. The feature would be blocking the
 * very operation it exists to protect.
 *
 * An abandoned capture classifies as `indeterminate`, which `planSave` already handles by saving
 * tokenless — the same path a dropped connection takes.
 */
export const CAPTURE_TIMEOUT_MS = 20_000

/**
 * Run `work` under a deadline, aborting it if the deadline passes.
 *
 * ⚑ **The bound spans the BODY READ, not just the headers.** `fetch` resolves as soon as headers
 * arrive, so clearing the timer around the `fetch` alone — which the first version of this did —
 * leaves `await res.json()` unbounded, and a stalled body reproduces the whole failure the deadline
 * exists to prevent: `inFlight` is held forever, no later capture runs, and `prepareForSave` waits on
 * it. Callers therefore do the fetch AND the parse inside the callback.
 *
 * ⚑ Hand-rolled rather than `AbortSignal.timeout(ms)` (which `generator/docxToPdf.ts` uses
 * server-side). Node implements that timer natively rather than through `globalThis.setTimeout`, so
 * vitest's fake timers cannot drive it — and the tests prove these bounds by advancing fake time.
 */
const withDeadline = async <T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const giveUp = new AbortController()
  const timer = setTimeout(() => giveUp.abort(), ms)
  try {
    // `await` inside the try, deliberately: returning the un-awaited promise would clear the timer
    // immediately and leave the request unbounded again.
    return await work(giveUp.signal)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * What a just-opened editor found waiting for it.
 *
 * `resolving` is a real state, not a loading detail: the form stays LOCKED through it. If typing
 * could begin before the answer arrived, applying a restore would `reset` the form and destroy those
 * keystrokes — so entry is a small state machine and this is its middle.
 */
export type RecoveryEntry =
  | { phase: 'idle' }
  | { phase: 'resolving' }
  | { phase: 'clear' }
  | {
      phase: 'offer'
      capture: OfferedCapture
      readOnly: boolean
      /**
       * How each captured key is named and ordered, sampled from the LIVE document at the moment the
       * offer opened.
       *
       * ⚑ Sampled ONCE, here, rather than derived during render. The caller used to compute it in
       * JSX, which meant rebuilding the entire form document — `reduceFieldsToValues` over every
       * field path, ~600 KB on the largest plan — on every render while the offer was open, and that
       * includes the renders the restore itself causes (`setRestoring`, then a batch from `reset`),
       * so it ran repeatedly during the one interaction the user is waiting on.
       *
       * Sampling here is also more correct: the anchors describe the document as it was when the
       * offer was made, which by design must not change while the offer is undecided.
       */
      anchors: { key: string; heading: string }[]
    }

export type UseEditRecovery = {
  status: RecoveryStatus
  entry: RecoveryEntry
  /** Call when the form ACTUALLY unlocks. Idempotent; a second call while active is a no-op. */
  start: () => void
  /** Pause, drain, capture, and report how the save should proceed. */
  prepareForSave: () => Promise<SavePlan>
  /** Adopt the token a successful save-as-new returned (retirement advances it one last time). */
  adoptToken: (token: RecoveryToken | null | undefined) => void
  /** Dismiss the offer and begin editing, leaving the capture untouched. */
  keepOffer: () => void
  /** Discard the offered capture — retires it server-side — and begin editing. */
  discardOffer: () => Promise<void>
}

export function useEditRecovery(args: {
  versionId: string | number
  /** True only when the form is genuinely unlocked and editable by this user. */
  active: boolean
  /** True while the form is dirty. */
  modified: boolean
  /**
   * A value whose IDENTITY changes on every edit — pass Payload's form-state object.
   *
   * ⚑ `modified` alone cannot drive the debounce. It is a BOOLEAN: it flips false→true on the first
   * keystroke and then never changes again, so an effect depending on it schedules exactly one
   * capture per editing session and every keystroke after the first is never backed up. That defect
   * survives the obvious manual test — type once, wait, see it captured — and only shows up when
   * someone keeps typing, which is the entire use case.
   */
  changeSignal: unknown
  /** The live form document. Called at capture time so the snapshot is never stale. */
  getDocument: () => Record<string, unknown>
  /** Registers the pre-expiry flush; see `flushRegistry`. */
  registerFlush: (entry: Registration) => () => void
}): UseEditRecovery {
  const { versionId, active, modified, changeSignal, getDocument, registerFlush } = args

  const [status, setStatus] = useState<RecoveryStatus>({ kind: 'off' })
  const [entry, setEntry] = useState<RecoveryEntry>({ phase: 'idle' })
  /**
   * Set once `start` has a token. STATE, not the ref below, because the debounce effect has to
   * re-run when it becomes true: a user who starts typing before `start` resolves would otherwise
   * never get a capture scheduled at all, since the effect saw a null token and returned.
   */
  const [ready, setReady] = useState(false)

  /**
   * Everything scoped to ONE editing session, in one cell with one reset.
   *
   * ⚑ Grouped deliberately. As four separate refs, "leaving edit mode ends the session" cleared three
   * of them and left `oversized` alive into the next unlock of the same mount — not because that line
   * was hard to write, but because nothing said what ending a session is supposed to clear. Now
   * `endSession` is the answer, and the next piece of session state is added inside this object.
   *
   * `inFlight` and `timer` are deliberately NOT here: they are transport- and timer-scoped, torn down
   * on their own schedule, and folding them in would make `endSession` cancel work it does not own.
   */
  const session = useRef<{
    token: RecoveryToken | null
    started: boolean
    /** Fingerprint of a request the server refused as too large; never resent unchanged. */
    oversized: string | null
    /**
     * Epoch-ms before which no capture may be attempted, set from a 429's `Retry-After`.
     *
     * ⚑ PROTOCOL STATE, not a timer. Backoff previously lived in the debounce timer, which meant
     * every other path silently cancelled it: the next keystroke cleared it via the debounce
     * cleanup, the pre-expiry flush cleared it outright, and `prepareForSave` fired a fresh capture
     * immediately after an in-flight 429. The limiter had told us how long to wait and we then hit
     * it three different ways. As a deadline, EVERY capture entry point observes it, because they
     * all go through `captureOnce`.
     */
    retryNotBefore: number
  }>({ token: null, started: false, oversized: null, retryNotBefore: 0 })

  /**
   * The entry phase, mirrored for the capture path.
   *
   * ⚑ A REF as well as state because `captureOnce` must read it without being re-created — and because
   * what it guards is destructive. While an offer is unresolved the stored capture is the only copy of
   * a previous session's work; a debounce tick that fired during `resolving` would overwrite it with
   * the current form and the teacher would never learn what was lost.
   */
  const entryPhase = useRef<RecoveryEntry['phase']>('idle')

  /**
   * The ONLY way the entry phase changes — ref and state together.
   *
   * ⚑ Wrapped rather than "remember to set both at each of the eleven call sites". The ref is what
   * stops a capture destroying an unread offer; a single site that updated only the state would
   * reopen that hole silently, with nothing to catch it.
   */
  /**
   * Is an offer still waiting on the user?
   *
   * ⚑ ONE owner for a predicate two guards depend on — this file already states the rule against a
   * "second weaker copy of that predicate" for the token/active/modified test. A fourth entry phase,
   * or a rename, must not have to be caught in two places.
   */
  const offerUnresolved = useCallback(
    () => entryPhase.current === 'resolving' || entryPhase.current === 'offer',
    [],
  )

  const enterPhase = useCallback((next: RecoveryEntry) => {
    entryPhase.current = next.phase
    setEntry(next)
  }, [])

  const inFlight = useRef<Promise<CaptureOutcome> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Backoff retry, held apart from `timer` so the debounce's cleanup cannot cancel it. */
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Bumped whenever the session this hook is serving changes — deactivation, or a different version.
   *
   * ⚑ Resetting refs does NOT cancel requests already in flight. Without this, Cancel-then-Edit (or
   * navigating between versions while active) lets a `start` or `capture` response from the OLD
   * session land afterwards and install its token over the new one — at which point every subsequent
   * write 409s against a row the user cannot see. Each request captures the epoch it began in and
   * discards its own result if that has moved on.
   */
  const epoch = useRef(0)

  // Refs mirroring props, so the registered flush and the timers read CURRENT values rather than the
  // closure they were created in. ⚑ Assigned in an effect, not during render: writing a ref while
  // rendering is a React rule violation (and the lint enforces it), because a render may be discarded.
  const live = useRef({ active, modified, getDocument, versionId, changeSignal })
  useEffect(() => {
    live.current = { active, modified, getDocument, versionId, changeSignal }
  })

  /**
   * The `changeSignal` identity whose content the server has CONFIRMED it stored.
   *
   * ⚑ Snapshotted when the request body is built, not when the response arrives, and only promoted on
   * an `ok`. That ordering is the whole point: an edit made WHILE a capture is in flight leaves this
   * pointing at the older signal, so the work is correctly reported unsafe. Promoting on response
   * would mark content safe that was never sent.
   */
  const capturedSignal = useRef<unknown>(null)

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  /** Both timers — session teardown only. The debounce alone must never cancel a backoff. */
  const clearAllTimers = useCallback(() => {
    clearTimer()
    if (retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = null
    }
  }, [clearTimer])

  /** One capture attempt. Returns the classified outcome; never throws. */
  /** The recovery endpoints for the version this hook is serving. */
  const recoveryUrl = useCallback(
    (suffix = '') => `/api/lesson-bundle-versions/${live.current.versionId}/recovery${suffix}`,
    [],
  )

  const captureOnce = useCallback(async (): Promise<CaptureOutcome> => {
    const mine = epoch.current
    const held = session.current.token
    if (!held) return { kind: 'definite', reason: 'rejected' }

    // ⚑ NOTHING is captured while an offer is unresolved. Until the teacher has decided, the stored
    // capture is the only copy of the previous session's work, and a capture now would replace it with
    // whatever is on screen — destroying the offer before it was read.
    //
    // ⚑ This does NOT rely on the form being locked, and must not. Payload 3.85.1's `useField()`
    // derives its `disabled` from `processing || initializing` ONLY — verified in installed source —
    // so `useForm().setDisabled` gates SUBMISSION, not field editability. The prompt is a portalled
    // modal with a focus trap, which is the interaction barrier; this is the guarantee underneath it,
    // and it holds whether or not any of that works.
    if (offerUnresolved()) return { kind: 'definite', reason: 'rejected' }

    // The single gate every caller passes through — debounce, blur, pre-expiry flush and the
    // pre-save flush alike. Refusing here is what makes the limiter's instruction actually binding.
    const waitMs = session.current.retryNotBefore - Date.now()
    if (waitMs > 0) {
      return { kind: 'definite', reason: 'rateLimited', retryAfterSec: Math.ceil(waitMs / 1000) }
    }

    const document = live.current.getDocument()
    // Snapshotted alongside the document it describes — see `capturedSignal`.
    const sentSignal = live.current.changeSignal
    const body = JSON.stringify({
      generation: held.generation,
      expectedRevision: held.revision,
      document,
    })

    // A request the server already refused as too large is not resent unchanged — that would burn the
    // rate-limit budget every debounce tick for the rest of the session, to be refused identically.
    //
    // ⚑ Hashed ONLY once a 413 has actually happened. Fingerprinting a ~550 KB body costs about as
    // much as the `JSON.stringify` above it, and in the common case — no 413 all session — the result
    // was computed and thrown away, doubling the synchronous work before every capture.
    if (session.current.oversized !== null && session.current.oversized === fingerprint(body)) {
      return { kind: 'definite', reason: 'tooLarge' }
    }

    try {
      const outcome = await withDeadline(CAPTURE_TIMEOUT_MS, async (signal) => {
        const res = await fetch(recoveryUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body,
          signal,
        })
        const parsed = (await res.json().catch(() => null)) as { token?: RecoveryToken } | null
        return classifyResponse(res.status, parsed, res.headers.get('Retry-After'))
      })
      // The session moved on while this was in flight; its result belongs to nobody.
      if (epoch.current !== mine) return { kind: 'indeterminate' }
      if (outcome.kind === 'ok') {
        session.current.token = outcome.token
        session.current.oversized = null
        // The server has this exact content. Anything typed since sending leaves the LIVE signal
        // different from this one, which is precisely how the safety probe stays honest.
        capturedSignal.current = sentSignal
      }
      if (outcome.kind === 'definite' && outcome.reason === 'tooLarge') {
        session.current.oversized = fingerprint(body)
      }
      if (outcome.kind === 'definite' && outcome.reason === 'rateLimited') {
        session.current.retryNotBefore = Date.now() + (outcome.retryAfterSec ?? 30) * 1000
      }
      return outcome
    } catch {
      // Network error, abort, timeout — the request may or may not have committed.
      return { kind: 'indeterminate' }
    }
  }, [recoveryUrl, offerUnresolved])

  /** Capture, honouring the single-flight guard. Callers await the SAME promise. */
  const capture = useCallback(async (): Promise<CaptureOutcome> => {
    if (inFlight.current) return inFlight.current
    const run = captureOnce().finally(() => {
      // ⚑ Only if it is still OURS. An unconditional clear let a capture from an abandoned session
      // settle and release the guard belonging to the CURRENT one — after which a second flush
      // could overlap it on the same `expectedRevision` and 409 against itself.
      if (inFlight.current === run) inFlight.current = null
    })
    inFlight.current = run
    return run
  }, [captureOnce])

  /**
   * A capture driven by the debounce or by blur: updates the indicator, schedules backoff.
   *
   * ⚑ A NAMED function expression, so the backoff timer can re-enter it by name. The obvious
   * alternatives are both worse: referencing the `const` inside its own initialiser is a
   * use-before-declaration, and routing through a `useRef` adds a mutable cell whose only job is to
   * point at the function beside it.
   */
  /**
   * Is the unsaved work in THIS editor stored, as of right now?
   *
   * ⚑ Synchronous and evaluated at the moment of the question, because its caller destroys work on the
   * answer. Nothing dirty is trivially safe. Otherwise the content on screen is safe only if the last
   * CONFIRMED capture was of this very content — which an edit during a flush, or an edit two seconds
   * before the deadline that the 8-second debounce cannot reach, makes false.
   */
  const isSafe = useCallback(
    () =>
      !live.current.active ||
      !live.current.modified ||
      (capturedSignal.current !== null && capturedSignal.current === live.current.changeSignal),
    [],
  )

  const captureAndReport = useCallback(
    /** Capture and paint the verdict. Whether the work is SAFE is answered by `isSafe`, not here. */
    async function run(): Promise<void> {
      if (!session.current.token || !live.current.active || !live.current.modified) return
      // ⚑ The entry gate refuses captures ON PURPOSE while an offer is unresolved, and that refusal
      // must not be REPORTED as one. `captureOnce` returns the same `rejected` outcome the server's
      // own refusals produce, which `statusForOutcome` paints as "NOT backed up: could not reach the
      // server" — so a debounce tick landing during `resolving` or `offer` told the teacher their work
      // was not being saved when nothing had gone wrong. Reachable both ways: fields are not
      // read-only while an offer is open (DECISIONS 2026-08-07 i), so typing restarts the debounce;
      // and the 10 s lookup bound is longer than the 8 s debounce, so a slow lookup meets it too.
      if (offerUnresolved()) return
      // ⚑ Nothing to send when the server already has this exact content. Covers the blur and
      // visibilitychange flushes and the 429 retry — `modified` cannot stop them, being Payload's
      // touched flag, which flips once and never clears. Without this, every alt-tab re-serialised
      // the whole ~600 KB document, uploaded it, advanced the server revision and spent rate-limit
      // budget to store bytes already stored. It cannot suppress a NEEDED capture: `capturedSignal`
      // is promoted only on `ok`, so any other outcome leaves `isSafe()` false. The save path goes
      // through `capture()` directly and is unaffected.
      if (isSafe()) return
      const mine = epoch.current
      setStatus({ kind: 'saving' })
      const outcome = await capture()
      // The session moved on while this was in flight — reporting now would paint a stale verdict
      // over whatever the current one is showing.
      if (epoch.current !== mine) return
      setStatus(statusForOutcome(outcome))
      if (outcome.kind === 'definite' && outcome.reason === 'rateLimited') {
        // Its OWN timer: the debounce's cleanup runs on every edit and would otherwise cancel this,
        // leaving the user on "retrying in Ns" with nothing scheduled to retry (matrix case 13).
        if (retryTimer.current) clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => void run(), (outcome.retryAfterSec ?? 30) * 1000)
      }
    },
    // `clearTimer` is gone from here deliberately: backoff now owns `retryTimer`, and this function
    // no longer touches the debounce at all.
    [capture, isSafe, offerUnresolved],
  )

  /**
   * POST `/recovery/start` and install the token it returns.
   *
   * ⚑ Extracted so DISCARD can reuse it. `retire` sets `retired_at`, and `capture` requires
   * `retired_at IS NULL` — so after a discard the row is dormant and EVERY later capture 409s, for the
   * rest of the editing session. Adopting the token the DELETE returns does not help: the token is
   * fine, the ROW is retired. `start` is the only operation that reactivates it (its `ON CONFLICT`
   * clears `retired_at` and bumps the generation), which is exactly the "a new session begins" step
   * the discard represents.
   *
   * Resolves true when a usable token is installed.
   */
  const requestStart = useCallback(
    async (mine: number): Promise<boolean> => {
      // ⚑ Bounded like every other recovery request. A `start` that never settles leaves `ready`
      // false forever, so the debounce effect never schedules anything: the session takes NO backups
      // at all while the indicator sits on "starting". Same class of harm the entry lookup's bound
      // exists to prevent, one call earlier in the same block — and it had no bound until this.
      const { res, body } = await withDeadline(ENTRY_LOOKUP_TIMEOUT_MS, async (signal) => {
        const r = await fetch(recoveryUrl('/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: '{}',
          signal,
        })
        // Parsed INSIDE the deadline: `fetch` resolves on headers, so a stalled body would otherwise
        // be unbounded — the same half-bound this file just fixed for capture.
        return { res: r, body: r.ok ? ((await r.json()) as { token?: RecoveryToken }) : null }
      })
      if (epoch.current !== mine) return false
      if (res.status === 409) {
        // At the per-user active-capture cap. Editing proceeds normally — refusing to let someone
        // work because their backup quota is full would be a worse failure than no backup — but the
        // indicator says so and the save sends no token.
        setStatus({ kind: 'unavailable', reason: 'atCapacity' })
        return false
      }
      if (!res.ok) {
        setStatus({ kind: 'unavailable', reason: 'failed' })
        return false
      }
      // Re-checked after the body: reading a response is itself a suspension point, and an
      // abandoned session must not install a token over the live one.
      if (epoch.current !== mine) return false
      if (!body?.token) {
        setStatus({ kind: 'unavailable', reason: 'failed' })
        return false
      }
      session.current.token = body.token
      setReady(true)
      setStatus({ kind: 'idle' })
      return true
    },
    [recoveryUrl],
  )

  const start = useCallback(() => {
    if (session.current.started) return
    session.current.started = true
    const mine = epoch.current
    setStatus({ kind: 'starting' })
    void (async () => {
      try {
        if (!(await requestStart(mine))) {
          if (epoch.current === mine) enterPhase({ phase: 'clear' })
          return
        }

        // ⚑ The GET runs AFTER `start`, deliberately. `start` is the only path that creates or
        // reactivates the row, so asking first would race it: a brand-new session would be told
        // "nothing stored" by a request that arrived before the row existed.
        enterPhase({ phase: 'resolving' })
        const { offer, offered } = await withDeadline(ENTRY_LOOKUP_TIMEOUT_MS, async (signal) => {
          const r = await fetch(recoveryUrl(), {
            method: 'GET',
            credentials: 'same-origin',
            signal,
          })
          return {
            offer: r,
            offered: r.ok
              ? ((await r.json()) as { capture: OfferedCapture | null })
              : { capture: null },
          }
        })
        if (epoch.current !== mine) return
        if (!offer.ok) {
          // A failed read is not a failed session: capture still works, there is simply nothing to
          // offer back. Moving on is the right outcome — refusing to let someone work because we
          // could not check for a backup would be a worse failure than not offering one.
          enterPhase({ phase: 'clear' })
          return
        }
        // ⚑ A capture we cannot DATE is not offered. The prompt's "Captured …" line is the whole
        // reason `capturedAt` exists, and an offer without it could only be labelled from
        // `baseUpdatedAt` — the source version's mtime — which is the exact lie the field was added
        // to remove, arriving under a malformed response where nobody would look.
        const capture = offered.capture?.capturedAt ? offered.capture : null
        const kind = offerKind(capture)
        enterPhase(
          kind === 'none' || !capture
            ? { phase: 'clear' }
            : {
                phase: 'offer',
                capture,
                readOnly: kind === 'readOnly',
                anchors: captureAnchors(live.current.getDocument()),
              },
        )
      } catch {
        // Same guard: a failed start from an abandoned session must not mark the CURRENT one
        // unavailable, which would tell the user their live session has no backup when it does.
        if (epoch.current !== mine) return
        enterPhase({ phase: 'clear' })
        // ⚑ Only a failed START means no backup. A thrown or timed-out entry LOOKUP leaves a perfectly
        // good session — the token is already installed above — so painting "unavailable" here would
        // tell the teacher their work is not being saved when it is.
        if (!session.current.token) setStatus({ kind: 'unavailable', reason: 'failed' })
      }
    })()
  }, [enterPhase, requestStart, recoveryUrl])

  const prepareForSave = useCallback(async (): Promise<SavePlan> => {
    clearTimer()
    // Drain anything already running BEFORE capturing, or the two would share an `expectedRevision`.
    //
    // ⚑ And ACT on what it returned rather than discarding it. If that write committed but its
    // response was lost, the token this client holds is already stale — capturing again with it
    // produces a 409, and the save is BLOCKED by the very failure the tokenless fallback exists to
    // absorb. Its verdict decides the save, exactly as a fresh capture's would.
    if (inFlight.current) {
      const prior = await inFlight.current.catch((): CaptureOutcome => ({ kind: 'indeterminate' }))
      if (prior.kind === 'conflict' || prior.kind === 'indeterminate') {
        setStatus(statusForOutcome(prior))
        return planSave(prior, session.current.token)
      }
    }
    if (!session.current.token) return { proceed: true, token: null }
    if (!live.current.modified) return { proceed: true, token: session.current.token }

    const outcome = await capture()
    const plan = planSave(outcome, session.current.token)
    setStatus(statusForOutcome(outcome))
    return plan
  }, [capture, clearTimer])

  const adoptToken = useCallback((next: RecoveryToken | null | undefined) => {
    if (next) session.current.token = next
  }, [])

  const keepOffer = useCallback(() => enterPhase({ phase: 'clear' }), [enterPhase])

  /**
   * Discard: retire the capture server-side, then begin editing.
   *
   * ⚑ Unlocks even when the retire FAILS. The user asked to get on with editing; refusing because
   * the tidy-up did not land would hold their work hostage to a cleanup they did not ask about. A
   * capture that survives is retired by the 30-day pass anyway.
   */
  const discardOffer = useCallback(async () => {
    const held = session.current.token
    const mine = epoch.current
    enterPhase({ phase: 'clear' })
    if (!held) return
    // ⚑ The token is dropped BEFORE the request. Between the DELETE landing and the restart
    // finishing, the row is retired and this token cannot capture against it — a debounce tick in
    // that window would fire a request guaranteed to 409 and paint "backup is out of date" over a
    // session that is merely mid-restart.
    session.current.token = null
    setReady(false)
    try {
      // ⚑ Bounded: the token is already dropped above, so an unbounded DELETE would hold the session
      // with no way to capture until the browser gave up on it.
      const res = await withDeadline(CAPTURE_TIMEOUT_MS, (signal) =>
        fetch(recoveryUrl(), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ generation: held.generation, expectedRevision: held.revision }),
          signal,
        }),
      )
      if (epoch.current !== mine) return
      // ⚑ RESTART, always — after a successful discard AND after a failed one.
      //
      // A discard RETIRES the row (`retired_at`), and `capture` requires `retired_at IS NULL`, so
      // without this every capture for the rest of the editing session 409s and the teacher's work
      // stops being backed up the moment they decline yesterday's. `start` is the only operation that
      // reactivates the row. It runs on failure too because a DELETE whose response was lost may well
      // have committed — and `start` on a live row is a harmless resume, so trying is strictly safer
      // than assuming.
      if (!res.ok && res.status !== 409) setStatus({ kind: 'unavailable', reason: 'failed' })
      await requestStart(mine)
    } catch {
      // The DELETE never reached the server, or the restart failed. Either way the session has no
      // usable token; the indicator says so rather than the failure being silent.
      if (epoch.current === mine && !session.current.token) {
        setStatus({ kind: 'unavailable', reason: 'failed' })
      }
    }
  }, [enterPhase, requestStart, recoveryUrl])

  // Debounced capture, restarted by every edit.
  //
  // ⚑ `changeSignal` is what makes this a real debounce: its identity changes on each keystroke, so
  // the effect re-runs, clears the pending timer and schedules a fresh one — and, after a capture
  // lands, schedules the NEXT one. `ready` is here so a session that started while the user was
  // already typing still gets its first capture scheduled.
  useEffect(() => {
    if (!active || !modified || !ready) {
      clearTimer()
      return
    }
    timer.current = setTimeout(() => void captureAndReport(), CAPTURE_DEBOUNCE_MS)
    return clearTimer
  }, [active, modified, ready, changeSignal, captureAndReport, clearTimer])

  // Flush on blur and when the tab is hidden — the last chance before a backgrounded tab's timers are
  // throttled, which is also the path a closing laptop lid takes.
  useEffect(() => {
    if (!active) return
    // No guard here: `captureAndReport` already tests token/active/modified unconditionally, and a
    // second weaker copy of that predicate can only drift from it.
    const flush = () => void captureAndReport()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('blur', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, captureAndReport])

  // The pre-expiry flush, via the registry `IdleLogout` provides.
  useEffect(() => {
    if (!active) return
    return registerFlush({
      // ⚑ No `isSafe()` check here: `captureAndReport` applies it unconditionally, so this would be
      // the "second weaker copy of that predicate" the debounce effect below warns against — and the
      // one that drifts. It moved down there when the blur and visibilitychange flushes turned out to
      // need the same guard and had never had it.
      flush: async () => {
        clearTimer()
        await captureAndReport()
      },
      isSafe,
    })
  }, [active, registerFlush, captureAndReport, clearTimer, isSafe])

  /**
   * End the session: stop BOTH timers, invalidate anything in flight, drop all session state.
   *
   * ⚑ One function because there are three ways a session ends — leaving edit mode, switching
   * version, and unmounting — and they were drifting apart. The version-change path had been
   * resetting state without stopping the timers, which left a scheduled 429 RETRY alive: it would
   * fire later holding the old document and the old token, against the row the NEXT editor is now
   * resuming, and advance the revision under it. The next capture from the editor the user is
   * actually looking at then 409s, caused by one that no longer exists.
   */
  const endSession = useCallback(() => {
    clearAllTimers()
    // Bumping the epoch is what makes this a real teardown: any request still in flight will now
    // discard its own result instead of installing it over whatever comes next.
    epoch.current += 1
    inFlight.current = null
    session.current = { token: null, started: false, oversized: null, retryNotBefore: 0 }
    // ⚑ `ready` and the entry phase are part of the session, so they end WITH it. As three lines
    // repeated at each call site they were the same "remember to set both" hazard `enterPhase`
    // exists to remove one level down: the unmount path already omitted two of them, and a session
    // left marked ready with no token has nothing to catch it.
    capturedSignal.current = null
    setReady(false)
    enterPhase({ phase: 'idle' })
  }, [clearAllTimers, enterPhase])

  // Leaving edit mode.
  useEffect(() => {
    if (active) return
    endSession()
  }, [active, endSession])

  // A different version is a different session, even without leaving edit mode.
  useEffect(() => {
    endSession()
  }, [versionId, endSession])

  // ⚑ UNMOUNT, which neither effect above covers: both are no-ops while `active` stays true and the
  // version does not change, so closing the editor mid-backoff previously left the retry scheduled.
  // A cleanup with stable deps runs only on unmount, which is exactly the moment meant.
  useEffect(() => () => endSession(), [endSession])

  // ⚑ `off` is DERIVED, not stored. Setting it from the effect above would be a setState-in-effect
  // cascade (and the lint rejects it), and it would also be a second source of truth for something
  // `active` already decides: while the form is locked there is nothing to report, whatever the last
  // capture did.
  return {
    status: active ? status : { kind: 'off' },
    entry: active ? entry : { phase: 'idle' },
    start,
    prepareForSave,
    adoptToken,
    keepOffer,
    discardOffer,
  }
}
