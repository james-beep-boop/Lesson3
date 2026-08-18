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
