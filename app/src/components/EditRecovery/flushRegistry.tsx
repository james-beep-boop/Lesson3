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
import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react'

/** Resolves when the flush has finished; never rejects — a failed flush is reported, not thrown. */
export type PreExpiryFlush = () => Promise<void>

type Registry = {
  /** Register a flush; call the returned disposer on unmount. */
  register: (flush: PreExpiryFlush) => () => void
  /** Run every registered flush. Used by `IdleLogout`; safe when nothing is registered. */
  runAll: () => Promise<void>
}

const noop: Registry = {
  register: () => () => {},
  runAll: async () => {},
}

const FlushRegistryContext = createContext<Registry>(noop)

export function EditRecoveryFlushProvider({ children }: { children?: React.ReactNode }) {
  // A Set, not a single slot: two editors could in principle be mounted (a drawer over a document),
  // and silently replacing one registration with another would drop a real flush.
  const flushes = useRef<Set<PreExpiryFlush>>(new Set())

  const register = useCallback((flush: PreExpiryFlush) => {
    flushes.current.add(flush)
    return () => {
      flushes.current.delete(flush)
    }
  }, [])

  const runAll = useCallback(async () => {
    // Snapshot first: a flush that unmounts its own editor would otherwise mutate the set mid-iteration.
    const current = [...flushes.current]
    // `allSettled`, because one editor's failure must not stop another's flush. The flushes themselves
    // are contracted not to reject, so this is belt and braces rather than the primary handling.
    await Promise.allSettled(current.map((flush) => flush()))
  }, [])

  const value = useMemo<Registry>(() => ({ register, runAll }), [register, runAll])

  return <FlushRegistryContext value={value}>{children}</FlushRegistryContext>
}

/** For the editor: register a flush for the lifetime of the calling component. */
export const useEditRecoveryFlushRegistry = (): Registry => useContext(FlushRegistryContext)
