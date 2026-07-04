/**
 * The one place the compose and reply flows share: POST a message via Payload's default REST
 * (`POST /api/messages`) — `sender` is stamped server-side and the daily cap is enforced there.
 * Throws an Error carrying the server's message on failure; the caller owns the busy/success/error UI
 * and the `router.refresh()`. Centralising it keeps Composer and ReplyBox from drifting on the request
 * shape or error parsing, and keeps the "a version only rides WITH its plan" rule (the server rejects a
 * lone version) in a single place.
 */
export async function sendMessage(input: {
  recipient: number
  body: string
  /** Optional lesson context. `version` is sent only when `lessonPlan` is too. */
  lessonPlan?: number | null
  version?: number | null
}): Promise<void> {
  const res = await fetch('/api/messages', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: input.recipient,
      body: input.body,
      ...(input.lessonPlan != null ? { lessonPlan: input.lessonPlan } : {}),
      ...(input.lessonPlan != null && input.version != null ? { version: input.version } : {}),
    }),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null
    throw new Error(payload?.errors?.[0]?.message ?? 'Could not send the message.')
  }
}
