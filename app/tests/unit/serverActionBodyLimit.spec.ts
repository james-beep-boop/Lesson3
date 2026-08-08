/**
 * The Server Action body ceiling ↔ the document ceilings it has to clear.
 *
 * ⚑ This pins a RELATIONSHIP, not a number. The failure it guards is silent and delayed: someone
 * raises a document ceiling that `MAX_PREVIEW_JSON_BYTES` / `MAX_RECOVERY_BODY_BYTES` set — a
 * reasonable thing to do — and the Server Action limit stays where it is. Nothing fails at that
 * moment. What fails, later, is TYPING into a document that size: Payload's form-state sync 500s, so
 * field validation and conditional logic quietly stop updating, and the app becomes one that will
 * happily store a plan it cannot edit. That defect already shipped once, undetected, because it is
 * invisible without the console open.
 *
 * It is the same discipline as `FLUSH_LEAD_MS` being derived from `CHECK_INTERVAL_MS` in
 * `IdleLogout` rather than merely documented as larger: a constant whose correctness depends on
 * another constant should be enforced, not trusted.
 *
 * ⚑ **The two endpoint ceilings are compared with `max`, never with each other.** `recoveryParse.ts`
 * records that its ceiling and preview's are deliberately separate and free to diverge — "the
 * duplication is the point", since preview's may be tuned for what the generator can afford to
 * render, which has nothing to do with what a capture may post. An earlier version of this file
 * asserted the two were EQUAL, which would have red-failed the first legitimate tuning of either and
 * invited someone to "fix" it by undoing a deliberate divergence. Whichever is larger is the one this
 * limit must clear.
 */
import { describe, expect, it } from 'vitest'

import { MAX_PREVIEW_JSON_BYTES } from '../../src/endpoints/previewParse'
import { MAX_RECOVERY_BODY_BYTES } from '../../src/endpoints/recoveryParse'
import {
  FORM_STATE_MULTIPLIER,
  SERVER_ACTION_BODY_LIMIT,
  SERVER_ACTION_BODY_LIMIT_BYTES,
} from '../../src/lib/serverActionBodyLimit'

/** The largest document any storing path currently accepts. */
const largestAcceptedDocument = () => Math.max(MAX_PREVIEW_JSON_BYTES, MAX_RECOVERY_BODY_BYTES)

describe('the Server Action body limit covers the documents this app accepts', () => {
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

  /**
   * ⚑ THE ASSERTION THIS FILE EXISTS FOR. A document at the ceiling costs `multiplier ×` its size in
   * form state (measured 2.57× on the largest plan in the corpus). If the limit stops clearing that,
   * the largest plans become uneditable — silently.
   */
  it('clears what a document at the largest accepted size actually costs', () => {
    expect(
      SERVER_ACTION_BODY_LIMIT_BYTES,
      'a document the app will store must remain editable',
    ).toBeGreaterThan(largestAcceptedDocument() * FORM_STATE_MULTIPLIER)
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

  /**
   * Next reads the STRING; the byte count is what the assertions above reason about. They are now
   * derived from one `LIMIT_MIB`, so this only confirms the two forms still describe one number —
   * cheap insurance against someone reintroducing a second literal.
   */
  it('states one number in both forms', () => {
    expect(SERVER_ACTION_BODY_LIMIT).toBe(`${SERVER_ACTION_BODY_LIMIT_BYTES / (1024 * 1024)}mb`)
  })
})
