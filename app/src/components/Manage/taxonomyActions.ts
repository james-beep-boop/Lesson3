'use client'

/**
 * The write layer shared by Manage → Subjects and Manage → Subject grades.
 *
 * ⚑ THE REQUESTS ARE SHARED; THE FIELDS ARE NOT. The two panels look alike — list, search, create,
 * rename, delete — but their forms genuinely differ (one text field against a relationship, an
 * integer, and a derived read-only title), and a component parameterised over that difference would
 * be a render-prop shell that is harder to read than either panel. What is worth sharing is the part
 * where a mistake is expensive and invisible: how a write is issued, how a busy state is held, and —
 * above all — how a REFUSAL reaches the screen.
 *
 * ⚑ SURFACING THE SERVER'S MESSAGE IS THE POINT OF THIS PR, not a detail of it. Both collections
 * already refuse destructive nonsense with actionable text: `guardSubjectDelete` and
 * `guardSubjectGradeDelete` throw 409s naming what still references the row, and the duplicate
 * `beforeValidate` throws a 400 reading "Grade N already exists for that subject." Those messages
 * exist and were, until now, only reachable through Payload's native table. A panel that swallowed
 * them into "Delete failed" would leave the guards technically working and practically useless —
 * which is why every path here routes through `wireErrorMessage`, and why the design doc specifies
 * "surface the existing 409 guard messages rather than implementing new guards".
 */
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast, useConfig } from '@payloadcms/ui'

import { apiBaseFrom } from '../../lib/apiBase'
import { wireErrorMessage } from '../../lib/wireError'

type TaxonomyCollection = 'subjects' | 'subject-grades'

export interface TaxonomyActions {
  /** The label of the in-flight operation, or null. Drives every control's disabled state. */
  busy: string | null
  /** The last refusal, kept in-panel so a 409 is readable next to the row it refers to. */
  error: string | null
  clearError: () => void
  create: (data: Record<string, unknown>, success: string) => Promise<boolean>
  rename: (id: number, data: Record<string, unknown>, success: string) => Promise<boolean>
  remove: (id: number, success: string) => Promise<boolean>
}

export function useTaxonomyActions(collection: TaxonomyCollection): TaxonomyActions {
  const router = useRouter()
  const { config } = useConfig()
  const apiBase = apiBaseFrom(config)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Returns whether it succeeded rather than throwing, because every caller needs to know: a create
   * form clears itself on success and KEEPS the typed values on failure. Payload's own form has that
   * behaviour and it is what made the duplicate-grade refusal survivable — retyping a rejected value
   * to read its error message again is how a refusal becomes indistinguishable from a broken page.
   */
  const run = useCallback(
    async (label: string, request: () => Promise<Response>, success: string, fallback: string) => {
      if (busy) return false
      setBusy(label)
      setError(null)
      try {
        const response = await request()
        if (!response.ok) throw new Error(await wireErrorMessage(response, fallback))
        toast.success(success)
        // The lists are server-loaded (D11: only Users is lazy), so a refresh is what re-renders
        // them — and it also re-renders the OTHER panel, which matters here: renaming a subject
        // rewrites every one of its subject-grades' display names through `refreshSubjectGradeTitles`.
        router.refresh()
        return true
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : fallback
        setError(message)
        toast.error(message)
        return false
      } finally {
        setBusy(null)
      }
    },
    [busy, router],
  )

  const send = useCallback(
    (path: string, method: string, data?: Record<string, unknown>) =>
      fetch(`${apiBase}/${collection}${path}`, {
        method,
        credentials: 'include',
        ...(data
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
          : {}),
        signal: AbortSignal.timeout(15_000),
      }),
    [apiBase, collection],
  )

  return {
    busy,
    error,
    clearError: useCallback(() => setError(null), []),
    create: useCallback(
      (data, success) => run('Create', () => send('', 'POST', data), success, 'Could not create'),
      [run, send],
    ),
    rename: useCallback(
      (id, data, success) =>
        run('Save', () => send(`/${id}`, 'PATCH', data), success, 'Could not save'),
      [run, send],
    ),
    remove: useCallback(
      (id, success) => run('Delete', () => send(`/${id}`, 'DELETE'), success, 'Could not delete'),
      [run, send],
    ),
  }
}
