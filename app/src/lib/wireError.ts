/**
 * The message inside a failed Payload REST response, or a stated fallback.
 *
 * Payload serialises a thrown `APIError` as `{ errors: [{ message }] }`, so every client that calls
 * an endpoint has to unwrap that shape to show the server's actual reason instead of a generic
 * "Update failed". Thirteen call sites had hand-written it, and they had already drifted: some use
 * `.catch(() => null)` and some `.catch(() => ({}))`, some append the status and some drop it, so two
 * buttons on the same screen could report the same 409 differently.
 *
 * ⚑ SCOPE, deliberately: this is introduced for the Manage user surfaces (the Users panel and the
 * Editing-access widget, which sit on one page and must agree), NOT as a sweep of the other eleven.
 * Those are stable code in unrelated files; they should adopt this when they are next touched, which
 * is the same rule `readJsonBody` and `personLabel` were introduced under.
 *
 * Never throws: an unparseable or non-JSON body falls back, because a failure to read the failure is
 * still a failure the user needs named.
 */
export async function wireErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    errors?: { message?: string }[]
  } | null
  return body?.errors?.[0]?.message || `${fallback} (${response.status})`
}

/**
 * What a delete says when Payload refuses it with 423 because someone has the document open in the
 * editing form (DECISIONS 2026-10-24 "Native document locks", decision 3). Deleting it from under them
 * would make their save fail, so the App honours the lock; it replaces Payload's raw "locked by another
 * user" text with something a teacher can act on. Since audit F-C22-002 a lock exists only when someone
 * genuinely has the document open, and it lapses five minutes after they stop editing.
 */
export const DOCUMENT_LOCKED_MESSAGE =
  'Someone is editing this right now. Try again in a few minutes.'

/** {@link DOCUMENT_LOCKED_MESSAGE} for a 423, otherwise null so the caller's own handling runs. */
export const documentLockedMessage = (response: Response): string | null =>
  response.status === 423 ? DOCUMENT_LOCKED_MESSAGE : null
