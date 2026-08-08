/**
 * The Server Action body ceiling ↔ the document ceiling it is derived from.
 *
 * ⚑ This pins a RELATIONSHIP, not a number. The failure it guards is silent and delayed: someone
 * raises the document ceiling that `MAX_PREVIEW_JSON_BYTES` / `MAX_RECOVERY_BODY_BYTES` set — a
 * reasonable thing to do — and the Server Action limit stays where it is. Nothing fails at that
 * moment. What fails, later, is TYPING into a document that size: Payload's form-state sync 500s, so
 * field validation and conditional logic quietly stop updating, and the app becomes one that will
 * happily store a plan it cannot edit. That defect already shipped once, undetected, because it is
 * invisible without the console open.
 *
 * It is the same discipline as `FLUSH_LEAD_MS` being derived from `CHECK_INTERVAL_MS` in
 * `IdleLogout` rather than merely documented as larger: a constant whose correctness depends on
 * another constant should be enforced, not trusted.
 */
import { describe, expect, it } from 'vitest'

import { MAX_PREVIEW_JSON_BYTES } from '../../src/endpoints/previewParse'
import { MAX_RECOVERY_BODY_BYTES } from '../../src/endpoints/recoveryParse'
import {
  FORM_STATE_MULTIPLIER,
  MAX_EDITABLE_DOCUMENT_BYTES,
  REQUIRED_BODY_BYTES,
  SERVER_ACTION_BODY_LIMIT,
  SERVER_ACTION_BODY_LIMIT_BYTES,
} from '../../src/lib/serverActionBodyLimit'

describe('the Server Action body limit covers the documents this app accepts', () => {
  /**
   * ⚑ The restatement this catches. `next.config.ts` is loaded before the app's module graph exists,
   * so it cannot import an endpoint module without dragging Payload's access layer into Next's config
   * pipeline — `MAX_EDITABLE_DOCUMENT_BYTES` is therefore a copy, and a copy needs a guard.
   */
  it('mirrors the document ceiling the storing paths already enforce', () => {
    expect(MAX_EDITABLE_DOCUMENT_BYTES).toBe(MAX_PREVIEW_JSON_BYTES)
    expect(MAX_EDITABLE_DOCUMENT_BYTES).toBe(MAX_RECOVERY_BODY_BYTES)
  })

  /**
   * ⚑ THE ASSERTION THIS FILE EXISTS FOR. A document at the ceiling costs `multiplier ×` its size in
   * form state (measured 2.57× on the largest plan in the corpus). If the limit stops clearing that,
   * the largest plans become uneditable — silently.
   */
  /**
   * ⚑ The multiplier must never UNDERSTATE the measurement. Rounding it down shrinks the derived
   * requirement, which makes the assertion below easier to pass — it flatters the limit. An earlier
   * version used 2.56 against a measured 2.5666…, with a comment claiming the opposite effect, and
   * no test noticed because 12 MiB clears both. This is the assertion that notices.
   */
  it('never rounds the measured multiplier in the flattering direction', () => {
    const MEASURED_BODY_BYTES = 1_587_513 // version 13, 13 lessons, 2026-08-07
    const MEASURED_DOCUMENT_BYTES = 618_518
    expect(FORM_STATE_MULTIPLIER).toBeGreaterThanOrEqual(
      MEASURED_BODY_BYTES / MEASURED_DOCUMENT_BYTES,
    )
  })

  it('clears what a document at that ceiling actually costs', () => {
    expect(REQUIRED_BODY_BYTES).toBe(MAX_EDITABLE_DOCUMENT_BYTES * FORM_STATE_MULTIPLIER)
    expect(
      SERVER_ACTION_BODY_LIMIT_BYTES,
      'a document the app will store must remain editable',
    ).toBeGreaterThan(REQUIRED_BODY_BYTES)
  })

  /**
   * The string and the byte count are two spellings of one decision, and Next only reads the string —
   * so a mismatch would leave the assertion above measuring a number the app does not use. `mb` is
   * MiB here, matching Next's own `bytes('1mb')` default.
   */
  it('states the same value in both forms', () => {
    const [, digits, unit] = /^(\d+)(kb|mb|gb)$/.exec(SERVER_ACTION_BODY_LIMIT) ?? []
    expect(digits, `unparseable limit: ${SERVER_ACTION_BODY_LIMIT}`).toBeDefined()
    const scale = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[unit as 'kb' | 'mb' | 'gb']
    expect(Number(digits) * scale).toBe(SERVER_ACTION_BODY_LIMIT_BYTES)
  })

  /**
   * ⚑ Not merely "bigger than the default". The whole defect was that the default is 1 MiB and the
   * real bodies are ~1.5 MB, so a change that raised it to, say, 2 MiB would look like a fix and
   * still fail on the corpus — which is why the measured body is named here rather than implied.
   */
  it('clears the largest body actually observed, with room', () => {
    const LARGEST_OBSERVED_BODY_BYTES = 1_587_513 // version 13, 13 lessons, 2026-08-07
    const NEXT_DEFAULT_BYTES = 1024 * 1024

    expect(LARGEST_OBSERVED_BODY_BYTES).toBeGreaterThan(NEXT_DEFAULT_BYTES)
    expect(SERVER_ACTION_BODY_LIMIT_BYTES / LARGEST_OBSERVED_BODY_BYTES).toBeGreaterThan(4)
  })
})
