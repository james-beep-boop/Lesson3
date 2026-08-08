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

/** Idle debounce before a capture (design §5: "~8 s idle, plus on blur"). */
const CAPTURE_DEBOUNCE_MS = 8_000

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
  | { phase: 'offer'; capture: OfferedCapture; readOnly: boolean }

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
  registerFlush: (flush: () => Promise<boolean>) => () => void
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
  const live = useRef({ active, modified, getDocument, versionId })
  useEffect(() => {
    live.current = { active, modified, getDocument, versionId }
  })

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
  const captureOnce = useCallback(async (): Promise<CaptureOutcome> => {
    const mine = epoch.current
    const held = session.current.token
    if (!held) return { kind: 'definite', reason: 'rejected' }

    // The single gate every caller passes through — debounce, blur, pre-expiry flush and the
    // pre-save flush alike. Refusing here is what makes the limiter's instruction actually binding.
    const waitMs = session.current.retryNotBefore - Date.now()
    if (waitMs > 0) {
      return { kind: 'definite', reason: 'rateLimited', retryAfterSec: Math.ceil(waitMs / 1000) }
    }

    const document = live.current.getDocument()
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
      const res = await fetch(`/api/lesson-bundle-versions/${live.current.versionId}/recovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body,
      })
      const parsed = (await res.json().catch(() => null)) as { token?: RecoveryToken } | null
      const outcome = classifyResponse(res.status, parsed, res.headers.get('Retry-After'))
      // The session moved on while this was in flight; its result belongs to nobody.
      if (epoch.current !== mine) return { kind: 'indeterminate' }
      if (outcome.kind === 'ok') {
        session.current.token = outcome.token
        session.current.oversized = null
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
  }, [])

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
  const captureAndReport = useCallback(
    /**
     * Capture and paint the verdict. Resolves whether the unsaved work is now SAFE — see
     * `PreExpiryFlush`, whose caller clears the screen on this answer.
     */
    async function run(): Promise<boolean> {
      // Nothing dirty (or nothing editable) is SAFE: there is no work here to lose.
      if (!live.current.active || !live.current.modified) return true
      // Dirty with no session token is the opposite — work exists and was never stored.
      if (!session.current.token) return false
      const mine = epoch.current
      setStatus({ kind: 'saving' })
      const outcome = await capture()
      // The session moved on while this was in flight — reporting now would paint a stale verdict
      // over whatever the current one is showing.
      if (epoch.current !== mine) return false
      setStatus(statusForOutcome(outcome))
      if (outcome.kind === 'definite' && outcome.reason === 'rateLimited') {
        // Its OWN timer: the debounce's cleanup runs on every edit and would otherwise cancel this,
        // leaving the user on "retrying in Ns" with nothing scheduled to retry (matrix case 13).
        if (retryTimer.current) clearTimeout(retryTimer.current)
        retryTimer.current = setTimeout(() => void run(), (outcome.retryAfterSec ?? 30) * 1000)
      }
      // Only a confirmed store counts. A scheduled retry is a promise to try again, not a backup.
      return outcome.kind === 'ok'
    },
    // `clearTimer` is gone from here deliberately: backoff now owns `retryTimer`, and this function
    // no longer touches the debounce at all.
    [capture],
  )

  const start = useCallback(() => {
    if (session.current.started) return
    session.current.started = true
    const mine = epoch.current
    setStatus({ kind: 'starting' })
    void (async () => {
      try {
        const res = await fetch(
          `/api/lesson-bundle-versions/${live.current.versionId}/recovery/start`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: '{}',
          },
        )
        if (epoch.current !== mine) return
        if (res.status === 409) {
          setEntry({ phase: 'clear' })
          // At the per-user active-capture cap. Editing proceeds normally — refusing to let someone
          // work because their backup quota is full would be a worse failure than no backup — but the
          // indicator says so and the save sends no token.
          setStatus({ kind: 'unavailable', reason: 'atCapacity' })
          return
        }
        if (!res.ok) {
          setEntry({ phase: 'clear' })
          setStatus({ kind: 'unavailable', reason: 'failed' })
          return
        }
        const body = (await res.json()) as { token?: RecoveryToken }
        // Re-checked AFTER awaiting the body: reading a response is itself a suspension point, and
        // an abandoned session must not install a token over the live one.
        if (epoch.current !== mine) return
        if (!body.token) {
          setEntry({ phase: 'clear' })
          setStatus({ kind: 'unavailable', reason: 'failed' })
          return
        }
        session.current.token = body.token
        setReady(true)
        setStatus({ kind: 'idle' })

        // ⚑ The GET runs AFTER `start`, deliberately. `start` is the only path that creates or
        // reactivates the row, so asking first would race it: a brand-new session would be told
        // "nothing stored" by a request that arrived before the row existed.
        setEntry({ phase: 'resolving' })
        const offer = await fetch(
          `/api/lesson-bundle-versions/${live.current.versionId}/recovery`,
          { method: 'GET', credentials: 'same-origin' },
        )
        if (epoch.current !== mine) return
        if (!offer.ok) {
          // A failed read is not a failed session: capture still works, there is simply nothing to
          // offer back. Unlocking is the right outcome — refusing to let someone edit because we
          // could not check for a backup would be a worse failure than not offering one.
          setEntry({ phase: 'clear' })
          return
        }
        const offered = (await offer.json()) as {
          capture: (Omit<OfferedCapture, 'capturedAt'> & { capturedAt?: string }) | null
          token?: RecoveryToken
        }
        if (epoch.current !== mine) return
        // ⚑ CAPTURE time comes from the token, which carries the row's own `updatedAt`; the endpoint's
        // `capture` object carries `baseUpdatedAt`, which is the SOURCE VERSION's mtime and belongs to
        // the staleness comparison, not to anything a user reads. Joined here rather than at the
        // endpoint so PR 1's wire contract and its tests stay untouched — the value was already on the
        // response, just under the other key.
        const capture = offered.capture && {
          ...offered.capture,
          capturedAt: offered.token?.updatedAt ?? offered.capture.baseUpdatedAt,
        }
        const kind = offerKind(capture)
        setEntry(
          kind === 'none' || !capture
            ? { phase: 'clear' }
            : { phase: 'offer', capture, readOnly: kind === 'readOnly' },
        )
      } catch {
        // Same guard: a failed start from an abandoned session must not mark the CURRENT one
        // unavailable, which would tell the user their live session has no backup when it does.
        if (epoch.current !== mine) return
        setEntry({ phase: 'clear' })
        setStatus({ kind: 'unavailable', reason: 'failed' })
      }
    })()
  }, [])

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

  const keepOffer = useCallback(() => setEntry({ phase: 'clear' }), [])

  /**
   * Discard: retire the capture server-side, then begin editing.
   *
   * ⚑ Unlocks even when the retire FAILS. The user asked to get on with editing; refusing because
   * the tidy-up did not land would hold their work hostage to a cleanup they did not ask about. A
   * capture that survives is retired by the 30-day pass anyway.
   */
  const discardOffer = useCallback(async () => {
    const held = session.current.token
    setEntry({ phase: 'clear' })
    if (!held) return
    try {
      await fetch(`/api/lesson-bundle-versions/${live.current.versionId}/recovery`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ generation: held.generation, expectedRevision: held.revision }),
      })
    } catch {
      // Deliberately swallowed — see above.
    }
  }, [])

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
    return registerFlush(async () => {
      clearTimer()
      return captureAndReport()
    })
  }, [active, registerFlush, captureAndReport, clearTimer])

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
  }, [clearAllTimers])

  // Leaving edit mode.
  useEffect(() => {
    if (active) return
    endSession()
    setReady(false)
    setEntry({ phase: 'idle' })
  }, [active, endSession])

  // A different version is a different session, even without leaving edit mode.
  useEffect(() => {
    endSession()
    setReady(false)
    setEntry({ phase: 'idle' })
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
