'use client'

/**
 * Manage accordion — open state, mirrored into the URL (D7/D7a).
 *
 * The panels' open state is CLIENT state that is mirrored into the address bar for reload survival
 * and deep linking; it is not state the server renders from. That distinction is the whole design:
 *
 *   - **Ordinary toggles write with `history.replaceState`** — no RSC navigation, no refetch, no
 *     history entry per open/close. ⚑ VERIFIED on `/admin` itself (2026-08-17), not inferred from
 *     the frontend: after a `replaceState`, resource-timing recorded zero new entries, a live
 *     `PerformanceObserver` recorded zero, and the dev server logged no second `GET /admin`. The
 *     instrument was independently shown to capture `?_rsc=` requests when they do occur. This
 *     matters because `router.push` here would re-run the dashboard server component and its ~9
 *     queries on every click — the documented 8.0s → 170ms optimization is what that would spend.
 *   - **Cross-panel jumps use router `push`**, so a jump is one meaningful, reversible history entry.
 *
 * `LibraryBrowser.tsx` already runs this exact pattern on the frontend (`?q=&subject=&grade=`) and
 * this hook deliberately follows its shape, including the part D7a does not mention: state is read
 * back **on popstate**, or the back button after a jump would restore the URL while leaving the
 * panels showing the pre-navigation state.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import {
  AT_PARAM,
  OPEN_PARAM,
  parseAt,
  parseOpen,
  serialiseOpen,
  withAncestors,
  withoutDescendants,
  type PanelId,
} from './panelState'

export interface OpenPanels {
  /** Is this panel currently disclosed? */
  isOpen: (id: string) => boolean
  /** Toggle one panel. Writes the URL with `replaceState` — never a navigation. */
  toggle: (id: string) => void
  /**
   * Open a panel (and its ancestors) as a JUMP: one history entry, via the router.
   *
   * ⚑ `PanelId`, not `string`, since 2026-08-18 — the one place in this interface where the loose type
   * was a real hazard rather than a stylistic choice. `isOpen`/`toggle` are driven by `AccordionPanel`,
   * which already holds a `PanelId`; `jumpTo` is called with a LITERAL from another component tree
   * (`UsersPanel` → Roles & Access). When that id was retired in the regrouping, `string` would have
   * accepted the stale spelling and `parseOpen` would then have dropped it as unknown: the jump lands
   * on a normal Manage page with nothing opened, no error, and a URL that still looks right. Typing it
   * makes that a compile error, which is how the same class of drift is caught in `subjectGradeAnchor`.
   */
  jumpTo: (id: PanelId, at?: string) => void
  /** The `at` target this page was arrived at with, consumed once and then scrubbed. */
  jumpTarget: string | null
  /** A focus consumer acknowledges only the target it actually found and focused. */
  consumeJumpTarget: (target: string) => void
}

export function useOpenPanels(
  available: readonly string[],
  /**
   * The open set computed by the SERVER from the request's query string.
   *
   * ⚑ This prop exists to prevent a hydration mismatch, and the mismatch was real: deriving the
   * initial state from `window.location` meant the server rendered `aria-expanded="false"` / `hidden`
   * while the client's first render computed `true` / not-hidden, and React reported
   * "A tree hydrated but some attributes of the server rendered HTML didn't match… This won't be
   * patched up" (caught in the browser on 2026-08-17). Deferring the read to an effect would have
   * fixed the warning by making every deep link visibly flash open after paint. Reading the query
   * server-side fixes both: a deep-linked page renders in its final shape on FIRST paint — the same
   * property `LibraryBrowser` has for its filters. See `AdminDashboard` for WHERE the server gets
   * the query from, which is not the obvious place.
   */
  serverOpen: readonly string[],
  serverAt: string | null,
): OpenPanels {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // `available` is a fresh array identity on every render of the server component, so the popstate
  // listener below depends on its VALUE rather than its reference — otherwise the listener would be
  // torn down and reinstalled on every render for no reason. The memo turns that key back into the
  // array ONCE, instead of the handler re-splitting a string it just joined (an encode/decode pair
  // sitting forty lines apart, in which a panel id containing a comma would silently become two).
  const availableKey = available.join(',')
  const availableIds = useMemo(() => availableKey.split(','), [availableKey])

  const locationSearch = searchParams.toString()
  const urlOpen = parseOpen(locationSearch, availableIds)
  const locationKey = serialiseOpen(pathname, locationSearch, urlOpen)
  const urlAt = parseAt(locationSearch)
  const [storedState, setState] = useState<{
    locationKey: string
    observedAt: string | null
    open: PanelId[]
    jumpTarget: string | null
  }>(() => ({
    locationKey,
    observedAt: serverAt,
    open: serverOpen as PanelId[],
    jumpTarget: serverAt,
  }))
  let state = storedState

  /**
   * Next integrates native history writes with `usePathname` / `useSearchParams`, so this is the one
   * place every URL arrival is read back: router navigation, Back/Forward, and our own replaceState.
   *
   * This is the documented React "adjust state while rendering" pattern, gated by a previous-value
   * comparison. An effect would paint the OLD disclosure state once and then correct it, while a
   * remounting `key` on the provider would destroy the local form/search/selection state D7a exists
   * to preserve. React immediately retries this component with the new snapshot before committing
   * its children, so a navigation cannot expose the stale panel set.
   */
  if (state.locationKey !== locationKey || state.observedAt !== urlAt) {
    const onlyScrubbedAt =
      state.locationKey === locationKey && state.observedAt !== null && urlAt === null
    const next = onlyScrubbedAt
      ? // `at` was consumed by our canonicalising replaceState. Preserve its in-memory value for
        // the focus consumer; a later real navigation changes the semantic location key.
        { ...state, observedAt: null }
      : {
          locationKey,
          observedAt: urlAt,
          open: urlOpen,
          jumpTarget: urlAt,
        }
    setState(next)
    state = next
  }

  /**
   * The open set actually in effect: raw state re-gated against CURRENT availability.
   *
   * ⚑ Availability is not fixed for the session — it is data-dependent. Deleting the last candidate
   * version calls `router.refresh()`, the server re-renders with `showSaved` false, and the
   * `versions` panel stops existing. Without this re-gate, `open` would keep an id for a panel that
   * is no longer on the page and the URL write below would keep advertising `?open=plans.versions` —
   * state the page is not in, which is exactly what the scrub rule exists to prevent. The mount-time gate
   * cannot cover it: the panel was legitimately available at mount.
   *
   * ⚑ DERIVED during render, not synced in an effect. The effect version (`setOpen` filtered by
   * availability) is what one reaches for first, and `react-hooks/set-state-in-effect` rejects it —
   * rightly, since it renders once with the stale set before correcting itself. Deriving needs no
   * second render and cannot fall out of step.
   *
   * ⚑ NOT COVERED BY A TEST, deliberately, and this is the honest reason rather than an oversight.
   * The only panel whose availability moves today is `versions`, and `showSaved` is
   * `candidates.length > 0 || !isAdmin` — so it disappears only for an ADMINISTRATOR whose
   * corpus-wide candidate count reaches zero. `tests/e2e` runs against a shared database where other
   * specs' fixtures are candidates too, so "delete the last one" is not something a test can arrange
   * without serialising the whole suite. A non-admin never loses the panel at all. If PR 2b/3 add a
   * panel with a cheaper disappearance condition, pin it then — that is the moment this becomes
   * testable, not a reason to fake it now.
   */
  const openNow = useMemo(
    () => state.open.filter((id) => availableIds.includes(id)),
    [state.open, availableIds],
  )

  /**
   * Mirror the open set into the address bar — on mount (which is also the scrub of whatever the URL
   * arrived with) and after every change.
   *
   * ⚑ THE URL WRITE LIVES IN AN EFFECT, and both of the obvious shorter alternatives are wrong:
   *
   *   - Inside a `setState` updater: React may invoke an updater during render, and
   *     `history.replaceState` synchronously notifies Next's router, which produced a real
   *     "Cannot update a component (`Router`) while rendering a different component
   *     (`AccordionProvider`)" error on the first working build (caught in the browser 2026-08-17 —
   *     neither `tsc` nor the unit suite sees it, because the projection itself is correct).
   *   - Beside the `setState` in the handler: it works, but it needs a ref holding the current open
   *     set to build the next one, and mutating a ref during render is what `react-hooks/refs`
   *     forbids — this repo lints at `--max-warnings=0`.
   *
   * An effect keyed on `open` covers the mount scrub and every subsequent change with one rule, no
   * refs, and no side effect inside an updater.
   *
   * It writes only when the URL would actually change. `jumpTo` deliberately does not update local
   * state before its `router.push` arrives, so this effect cannot rewrite the history entry the jump
   * is meant to preserve. Once the destination URL arrives, the location snapshot above adopts its
   * open set and `at`; this effect then consumes that one-shot parameter. `jumpTarget` is already in
   * state by then, so removing it from the address bar cannot take it away.
   */
  useEffect(() => {
    /**
     * ⚑ DEFERRED BY ONE MICROTASK, and it is load-bearing — without it the BACK BUTTON silently stops
     * working for the rest of the session. Proven in a browser (2026-08-19), not reasoned about:
     *
     *   1. Next's app-router patches `window.history.replaceState` inside its OWN effect, and React
     *      flushes a CHILD's passive effects before its parent's. On the first commit this provider is
     *      the child, so an undeferred write here reaches the NATIVE `replaceState` and stamps the
     *      entry with `state: null`. That is not a guess: the patched implementation runs
     *      `copyNextJsInternalHistoryState`, which returns `{}` at minimum, so a genuinely null state
     *      is only reachable by bypassing it — and the failing page measured exactly
     *      `history.state === null`.
     *   2. `onPopState` in `next/dist/client/components/app-router.js` opens with
     *      `if (!event.state) return`. A stateless entry therefore makes Back a router-level NO-OP:
     *      the browser restores the URL, Next never dispatches, `useSearchParams` never updates, and
     *      the panels keep showing the pre-Back state while the address bar disagrees.
     *   3. It also loses the URL itself as far as the router is concerned, since the native call never
     *      runs `applyUrlFromHistoryPushReplace` — so Next's `canonicalUrl` still holds the
     *      pre-canonicalisation query.
     *
     * One microtask puts this after the whole effect flush: the patch is installed, Next has seeded
     * `__NA` + its internals tree on the entry, and the patched call copies both onto our write.
     *
     * ⚑ A MICROTASK, and the two rejected alternatives are both recorded because each was tried and
     * each FAILED A DIFFERENT TEST — the deferral mechanism is the whole subtlety here:
     *
     *   - `setTimeout(…, 0)` fixes Back but leaves the address bar one MACROTASK behind the panels, and
     *     "open state survives a genuine reload" reloads immediately after the click. The write loses
     *     the race, the URL never carries the panel, and a durability guarantee becomes a coin toss.
     *     A human would rarely win that race; a reload issued by code wins it every time.
     *   - Deferring only while `window.history.state === null` looked like the precondition stated
     *     exactly, and it is NOT: Next stamps the entry before this child effect runs but installs its
     *     `replaceState` patch later, so a non-null state does not mean the patch is in place. Measured
     *     — this version put the Back failure straight back.
     *
     * A microtask is the one option that satisfies both. It runs after React's entire passive-effect
     * flush (so the parent router's patch is installed) yet still inside the SAME task, before the
     * browser can process any later event — including a reload command. `cancelled` covers the unmount
     * case, since a microtask cannot be cleared like a timer.
     *
     * ⚑ THIS WAS A PRE-EXISTING BUG, not a consequence of the four-box regrouping — bisected on
     * pristine `main`, where forcing the same canonicalisation into the pre-jump URL reproduces it
     * exactly. The regrouping only made the ordinary path hit it, because `users.accounts` always
     * arrives needing its ancestor added. See DECISIONS 2026-08-19.
     */
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const target = serialiseOpen(window.location.pathname, window.location.search, openNow)
      if (target !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, '', target)
      }
    })
    return () => {
      cancelled = true
    }
  }, [openNow, state.jumpTarget, pathname, locationSearch])

  const isOpen = useCallback((id: string) => openNow.includes(id as PanelId), [openNow])

  // URL scrubbing and focus consumption are separate acknowledgements. The former prevents a
  // reload from replaying `at`; the latter prevents an unrelated data refresh from stealing focus
  // after the destination component already handled it. A missing target is deliberately retained
  // so it can still be handled if its data arrives later.
  const consumeJumpTarget = useCallback((target: string) => {
    setState((current) =>
      current.jumpTarget === target ? { ...current, jumpTarget: null } : current,
    )
  }, [])

  // A pure updater — no side effects, so React may safely call it during render.
  const toggle = useCallback(
    (id: string) => {
      setState((current) => ({
        ...current,
        open: current.open.includes(id as PanelId)
          ? // Closing a parent closes its subtree, so reopening does not spring back to a shape the
            // user last saw several interactions ago.
            withoutDescendants(current.open, id)
          : withAncestors([...current.open, id as PanelId]),
      }))
    },
    [setState],
  )

  /**
   * A jump is a navigation, not a toggle: it moves the reader to a different part of the page in
   * response to a deliberate "go to…" affordance, so it earns exactly one history entry and the back
   * button returns them. `push` re-runs the server component — acceptable once per jump, and wrong
   * per toggle, which is the distinction D7a draws.
   *
   * The Users-panel grant link is the first real consumer. Its browser test asserts the destination
   * group receives focus and Back restores the prior panel set, so the meaningful-history-entry
   * claim is pinned at the rendered boundary rather than only in the serialisation unit tests.
   */
  const jumpTo = useCallback(
    (id: PanelId, at?: string) => {
      // Do NOT set local state here. The push is asynchronous; doing so lets the URL-mirror effect
      // run against the OLD location, replacing the history entry this jump is meant to preserve.
      // The reactive location snapshot above adopts the destination state when the push arrives.
      const next = withAncestors([...openNow, id])
      const params = new URLSearchParams(window.location.search)
      params.set(OPEN_PARAM, next.join(','))
      if (at) params.set(AT_PARAM, at)
      else params.delete(AT_PARAM)
      router.push(`${window.location.pathname}?${params.toString()}`)
    },
    [openNow, router],
  )

  return { consumeJumpTarget, isOpen, toggle, jumpTo, jumpTarget: state.jumpTarget }
}
