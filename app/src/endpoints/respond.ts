/**
 * Shared JSON Response helper for the custom endpoints (save-as-new / make-official / export /
 * assignment endpoints) — one definition instead of a copy per endpoints file.
 */
export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
