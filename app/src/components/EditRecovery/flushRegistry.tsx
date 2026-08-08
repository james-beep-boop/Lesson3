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
 * Runs the flush and reports whether that editor's unsaved work is now SAFE — stored server-side, or
 * absent because nothing is dirty. Never rejects; a failed flush resolves `false`.
 *
 * ⚑ The boolean is not diagnostics. `IdleLogout` decides whether to CLEAR THE SCREEN on it, and
 * clearing a screen whose work was never captured would destroy it. Anything short of a confirmed
 * store — a 409, a 429 backoff, a dropped connection, a token this hook never obtained — is `false`.
 */
export type PreExpiryFlush = () => Promise<boolean>

export type FlushRegistry = {
  /** Register a flush; call the returned disposer on unmount. */
  register: (flush: PreExpiryFlush) => () => void
  /**
   * Run every registered flush; resolves true only when EVERY one reported safe.
   *
   * Vacuously true when nothing is registered — no editor mounted means no unsaved work to lose,
   * which is the common case for an admin session idling on a list view.
   */
  runAll: () => Promise<boolean>
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
  // ⚑ false, not true. If the provider is ever missing, the honest answer to "is the work safe?" is
  // "we have no idea" — and the caller must not clear a screen on that.
  runAll: async () => false,
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
  const flushes = useRef<Set<PreExpiryFlush> | null>(null)
  flushes.current ??= new Set()

  // One memo, empty deps: nothing here can ever change identity, so three separate memoised callbacks
  // were three dependency arrays guarding a value that is stable by construction.
  return useMemo<FlushRegistry>(() => {
    const set = flushes.current as Set<PreExpiryFlush>
    return {
      register: (flush) => {
        set.add(flush)
        return () => {
          set.delete(flush)
        }
      },
      runAll: async () => {
        // Snapshot first: a flush that unmounts its own editor would otherwise mutate the set
        // mid-iteration. `allSettled` so one editor's failure cannot stop another's flush.
        const results = await Promise.allSettled([...set].map((flush) => flush()))
        // A rejection counts as unsafe even though `PreExpiryFlush` promises not to throw — the
        // contract is a comment, and this decision gates destroying work.
        return results.every((r) => r.status === 'fulfilled' && r.value === true)
      },
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
