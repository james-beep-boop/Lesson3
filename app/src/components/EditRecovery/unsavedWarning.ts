/**
 * The sentence a delete confirmation adds when deleting a version would discard unsaved work
 * (SPEC §5, "Drafts", 2026-10-17).
 *
 * Deleting a version cascades its edit-recovery rows away, so a draft someone has on it is lost
 * with it. Every surface that deletes a version on purpose — the editor's Delete, Manage's
 * saved-version list, Save's "delete the version you opened", and Make Official's "delete the
 * previous Official" — asks this first and folds the answer into its existing `confirm`.
 *
 * ⚑ ADVISORY, and it fails OPEN: a failed or refused lookup returns '' and the confirmation reads
 * exactly as it did before this existed. Blocking a deletion because a warning could not be fetched
 * would make the warning a gate, which it is not — the delete endpoint remains the authority.
 */

// The wire shape, owned by the server (a type-only import is erased from the client bundle).
import type { UnsavedCount } from '../../lib/editRecovery/kernel'
import { withDeadline } from './deadline'

/** Pure: the sentence for a count, or '' when nobody would lose anything. Exported for the tests. */
export function unsavedWarningText(counts: UnsavedCount, countCaller = true): string {
  const others = counts.otherUsers
  const mine = countCaller && counts.includesCaller
  if (others === 0 && !mine) return ''
  const othersPhrase = others === 1 ? '1 other person' : `${others} other people`
  const who =
    others === 0
      ? 'You have'
      : mine
        ? `You and ${othersPhrase} have`
        : `${othersPhrase} ${others === 1 ? 'has' : 'have'}`
  // One draft per person per version, so a single holder has "a draft".
  const drafts = others + (mine ? 1 : 0) === 1 ? 'a draft' : 'drafts'
  return `${who} ${drafts} based on this version. Deleting it discards ${drafts === 'a draft' ? 'it' : 'them'}.`
}

/**
 * How long the warning lookup may take before the confirmation opens without it.
 *
 * ⚑ BOUNDED, because its callers wait on it with the form LOCKED (audit 2026-10-17): Save takes the
 * lock before asking, so a lookup that never answered left the editor on "Saving…" with every
 * button disabled and the save never sent — an advisory warning blocking the operation it advises
 * on. The bound covers the whole lookup, body read included (`fetch` resolves on headers alone).
 * Exported so the tests advance the real value.
 */
export const WARNING_TIMEOUT_MS = 3_000

/**
 * Fetch the warning for `versionId`. `countCaller: false` for Save's delete-source path, where the
 * caller's own capture is retired by the save itself and nothing of theirs is lost.
 *
 * Fails open on error, refusal, malformed body AND timeout: the confirmation then reads exactly as it
 * did before this existed.
 */
export async function unsavedWorkWarning(
  versionId: number | string,
  opts: { apiBase?: string; countCaller?: boolean } = {},
): Promise<string> {
  // Bounded by the shared deadline (abort AND race — see `deadline.ts`); every failure, the
  // timeout included, falls back to no warning.
  return withDeadline(WARNING_TIMEOUT_MS, async (signal) => {
    const res = await fetch(
      `${opts.apiBase ?? '/api'}/lesson-bundle-versions/${versionId}/recovery/unsaved-count`,
      { credentials: 'same-origin', signal },
    )
    if (!res.ok) return ''
    const body = (await res.json()) as Partial<UnsavedCount>
    if (typeof body.otherUsers !== 'number' || typeof body.includesCaller !== 'boolean') return ''
    return unsavedWarningText(body as UnsavedCount, opts.countCaller ?? true)
  }).catch(() => '')
}

/**
 * `question`, followed by the unsaved-work warning when there is one — the text every delete
 * confirmation passes to `window.confirm`. One place decides how the two are joined.
 */
export async function withUnsavedWarning(
  question: string,
  versionId: number | string,
  opts: { apiBase?: string; countCaller?: boolean } = {},
): Promise<string> {
  const warning = await unsavedWorkWarning(versionId, opts)
  return warning ? `${question}\n\n${warning}` : question
}
