'use client'

/**
 * The bridge between the mounted editor and the session-expiry clock.
 *
 * ⚑ **Why this exists at all.** The pre-expiry flush (design §5) has to run code that lives in
 * `LessonControls` — the current capture token, the in-flight write, the live form snapshot — but the
 * component that knows when the token expires is `IdleLogout`, registered in
 * `admin.components.providers`. Without an explicit hand-off the pre-expiry guarantee is aspirational:
 * one component owns the deadline and the other owns the operation, and nothing connects them.
 *
 * So the editor REGISTERS its flush here on mount and UNREGISTERS on unmount, and `IdleLogout` calls
 * whatever is registered. `IdleLogout` hosts this provider itself rather than it being a second
 * top-level provider, which removes any question about provider ordering: one component owns the
 * deadline AND the thing to do before it.
 *
 * ⚑ **Registration is by identity, and unregistering is not optional.** A flush belonging to an
 * unmounted editor would post a capture for a form nobody is looking at, against a token that
 * component no longer owns. The returned disposer must run in the effect cleanup.
 *
 * ⚑ **Register a STABLE callback that reads refs**, not a fresh closure each render. A closure
 * captured at registration time freezes the token and the snapshot as they were then, and the flush
 * would send stale work — the precise failure the revision precondition exists to catch, arriving from
 * our own side.
 */
import React, { createContext, useContext, useMemo, useRef } from 'react'

/**
 * Store whatever this editor has, now, because the session is about to end.
 *
 * ⚑ Returns NOTHING, deliberately. It used to report a boolean that `IdleLogout` remembered and later
 * cleared the screen on — and a remembered verdict is stale the moment the teacher types again, which
 * is the defect {@link SafetyProbe} replaced it with. Leaving the boolean in place afterwards would
 * keep a second, plausible-looking answer to "is the work safe?" sitting next to the real one, for a
 * future caller to reach for.
 */
export type PreExpiryFlush = () => Promise<void>

/**
 * Is this editor's unsaved work SAFE **right now** — synchronously, with no request?
 *
 * ⚑ This exists because a REMEMBERED flush verdict is stale by construction. A flush that succeeded
 * 29 seconds before the deadline says nothing about text typed two seconds before it, and the 8-second
 * debounce cannot land in that gap — so a boolean cached from the last flush would clear the screen
 * over uncaptured work. Only the editor can answer for the CURRENT form, and it can answer instantly:
 * it knows whether the form is dirty and whether the content it last stored is still the content on
 * screen.
 *
 * It is also what lets a flush skip its own work: a probe that already says safe means the server has
 * this exact content, so there is nothing to send.
 */
export type SafetyProbe = () => boolean

export type Registration = {
  flush: PreExpiryFlush
  isSafe: SafetyProbe
}

export type FlushRegistry = {
  /** Register an editor's flush and safety probe; call the returned disposer on unmount. */
  register: (entry: Registration) => () => void
  /**
   * Run every registered flush.
   *
   * ⚑ SINGLE-FLIGHT. Three separate triggers — the interval, `focus` and `visibilitychange` — can all
   * reach this within the pre-expiry window, and concurrent runs would have each editor capturing
   * against a token another run had just advanced, producing self-inflicted 409s. A run already in
   * progress is joined rather than duplicated.
   */
  runAll: () => Promise<void>
  /**
   * Ask every editor, synchronously, whether its unsaved work is stored.
   *
   * ⚑ This — not a cached `runAll` result — is what the screen clear is allowed to act on. It cannot
   * be stale, because it is evaluated at the moment of the decision.
   */
  allSafe: () => boolean
}

/**
 * ⚑ The default is a NO-OP, and that is the failure mode worth knowing about: if the provider is ever
 * missing or nested below its consumer, nothing throws — the pre-expiry flush simply never runs, and
 * unsaved work is silently not backed up. That is why the provider and the component that triggers it
 * are the same component (see `IdleLogout`), rather than two entries in `admin.components.providers`
 * whose order could be changed by someone with no reason to connect the two.
 */
const FlushRegistryContext = createContext<FlushRegistry>({
  register: () => () => {},
  runAll: async () => {},
  // ⚑ false, not true. If the provider is ever missing, the honest answer to "is the work safe?" is
  // "we have no idea" — and the caller must not destroy a screenful of work on that.
  allSafe: () => false,
})

/**
 * Build the registry value.
 *
 * Returned as a hook rather than a provider component so the host can BOTH own it and use it: a
 * component cannot consume a context it renders itself, and the alternative was an inner wrapper
 * component existing purely to read what its parent had just provided.
 */
export function useFlushRegistry(): FlushRegistry {
  // A Set, not a single slot: two editors could in principle be mounted (a drawer over a document),
  // and silently replacing one registration with another would drop a real flush.
  const flushes = useRef<Set<Registration> | null>(null)
  flushes.current ??= new Set()
  /** The join point for the single-flight `runAll`. */
  const running = useRef<Promise<void> | null>(null)

  // One memo, empty deps: nothing here can ever change identity, so three separate memoised callbacks
  // were three dependency arrays guarding a value that is stable by construction.
  return useMemo<FlushRegistry>(() => {
    const set = flushes.current as Set<Registration>
    return {
      register: (entry) => {
        set.add(entry)
        return () => {
          set.delete(entry)
        }
      },
      runAll: () => {
        // Join an in-progress run rather than starting a second one — see the type's note.
        if (running.current) return running.current
        // Snapshot first: a flush that unmounts its own editor would otherwise mutate the set
        // mid-iteration. `allSettled` so one editor's failure cannot stop another's flush.
        const run = Promise.allSettled([...set].map((e) => e.flush()))
          .then(() => undefined)
          .finally(() => {
            running.current = null
          })
        running.current = run
        return run
      },
      allSafe: () =>
        // A probe that throws is not evidence of safety.
        [...set].every((e) => {
          try {
            return e.isSafe() === true
          } catch {
            return false
          }
        }),
    }
  }, [])
}

export function EditRecoveryFlushProvider({
  registry,
  children,
}: {
  registry: FlushRegistry
  children?: React.ReactNode
}) {
  return <FlushRegistryContext value={registry}>{children}</FlushRegistryContext>
}

/** For the editor: register a flush for the lifetime of the calling component. */
export const useEditRecoveryFlushRegistry = (): FlushRegistry => useContext(FlushRegistryContext)
