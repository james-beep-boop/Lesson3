/**
 * Turn text into HTML-safe text.
 *
 * ⚑ ONE COPY, DELIBERATELY. Two call sites need this and they need it for different reasons, which is
 * exactly why it should not be written twice:
 *
 *   - `compareGroups.ts` re-escapes a bare text node while serializing already-sanitized HTML back to
 *     a string. Its input is trusted; the escaping preserves a round-trip.
 *   - `EditRecovery/restoreDiff.ts` escapes RAW PROSE a teacher typed, before handing it to an engine
 *     whose output is injected with `dangerouslySetInnerHTML`. Its input is untrusted, and this call
 *     is the whole reason that injection is safe.
 *
 * The second makes it a security primitive, and a security primitive with two near-identical copies is
 * one edit away from having two different behaviours. `&` must stay FIRST — escape it after `<` and the
 * `&` of a just-written `&lt;` is escaped again, yielding `&amp;lt;`.
 *
 * Deliberately dependency-free: imported by both a server module and a client component.
 */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
