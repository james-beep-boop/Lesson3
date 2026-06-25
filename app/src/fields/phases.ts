/**
 * Controlled vocabulary for `framework[].phase` (SPEC §4).
 *
 * Phase names drive the generator's colour-coding and resource bucketing
 * (`PHASE_COLOUR[ph.phase]` / `PHASE_KEY[ph.phase]` in vendor/lib/sections.js); an
 * unknown phase silently degrades the document (grey cell, wrong resource bucket).
 * The five values match `bio_1_4`'s phases, verified against the generator's colour-map
 * keys. Single source of truth: the `lessonContent.ts` phase select options AND the ingest /
 * version completeness gate (`validateGeneratable`) both read this.
 */
export const PHASE_VALUES = [
  'Predict Phase',
  'Observe Phase',
  'Explain Phase',
  'Driving Question Board (DQB) Creation',
  'Model Building Phase',
] as const

export type Phase = (typeof PHASE_VALUES)[number]

export const PHASE_OPTIONS = PHASE_VALUES.map((p) => ({ label: p, value: p }))

/** True if `value` is one of the five controlled phase names. */
export const isPhase = (value: unknown): value is Phase =>
  typeof value === 'string' && (PHASE_VALUES as readonly string[]).includes(value)
