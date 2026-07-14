/**
 * Display-level casing for stored lesson titles (design track D5, critique cross-cutting #5).
 * Ingested titles arrive ALL CAPS ("BIOLOGY GRADE 10: PLANT TRANSPORT") and the stored value is
 * generator input — it must never be rewritten in the data. Page CHROME (headings, link labels)
 * may soften it: an all-caps title renders in Title Case; anything already mixed-case is someone's
 * deliberate casing and passes through untouched. Content rendered from the generator (the
 * document preview itself) keeps the faithful stored casing.
 */
export function displayTitle(title: string): string {
  // Any lowercase letter = deliberate casing; no uppercase at all = nothing to soften.
  if (/[a-z]/.test(title) || !/[A-Z]/.test(title)) return title
  // Capitalize the first letter of each word. An apostrophe (straight or curly) is NOT a word
  // boundary, so DON'T → Don't and TEACHER'S → Teacher's, not Don'T / Teacher'S.
  return title
    .toLowerCase()
    .replace(/(^|[^a-zA-Z'’])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase())
}
