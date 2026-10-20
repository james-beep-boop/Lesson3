/**
 * `ares-content-v1` — the ARES release fingerprint (2026-10-19, `lib/identity/releaseFingerprint.ts`).
 *
 * ⚑ THE VECTOR BELOW IS FROZEN. If a change to the module breaks it, the change is wrong: every school
 * already holds fingerprints in this format, and a silent change would stop them matching. A new rule
 * belongs in a new format (`ares-content-v2`), with its own vectors, alongside this one.
 *
 * The hash was checked independently: `printf '%s' '<CANONICAL>' | sha256sum`.
 */
import { describe, expect, it } from 'vitest'

import {
  RELEASE_FINGERPRINT_FORMAT,
  releaseFingerprint,
  releaseFingerprintInput,
} from '../../src/lib/identity/releaseFingerprint'
import { comparableContent, DROP_KEYS } from '../../src/lib/versionContent'

/** A bundle as an upload produces it. */
const upload = () => ({
  title: 'Cell Structure',
  meta: { subject: 'Biology', grade: 10, substrand_id: '1.1', substrand_name: 'Cell Structure' },
  unit: null,
  lessons: [
    {
      title: 'Lesson one',
      framework: [{ phase: 'Predict Phase', learnerExperience: 'Observe a leaf.' }],
      resourceLinks: [
        {
          phase: 'predict',
          video: null,
          reading: { title: 'Cells', has_transcript: false, tier: 0 },
          fallback_search_url: 'http://ares.local/s',
        },
      ],
    },
  ],
  finalExplanation: null,
  summaryTable: null,
})

const CANONICAL =
  '{"lessons":[{"framework":[{"learnerExperience":"Observe a leaf.","phase":"Predict Phase"}],' +
  '"number":1,"resourceLinks":[{"fallback_search_url":"http://ares.local/s","phase":"predict",' +
  '"reading":{"has_transcript":false,"tier":0,"title":"Cells"}}],"title":"Lesson one"}],' +
  '"meta":{"grade":10,"subject":"Biology","substrand_id":"1.1","substrand_name":"Cell Structure"},' +
  '"title":"Cell Structure"}'
const FINGERPRINT =
  'ares-content-v1:sha256:cecd8a38a70ec494d707bd54c5c998fbc8e5399f91087c7eafe960fa3314bde9'

describe('ares-content-v1 test vector (frozen)', () => {
  it('produces exactly the frozen canonical text and fingerprint', () => {
    expect(RELEASE_FINGERPRINT_FORMAT).toBe('ares-content-v1')
    expect(releaseFingerprintInput(upload())).toBe(CANONICAL)
    expect(releaseFingerprint(upload())).toBe(FINGERPRINT)
  })
})

describe('the same release gives the same fingerprint as uploaded and as stored', () => {
  it('ignores row ids, Payload padding, derived lesson numbers and key order', () => {
    // The same bundle as Payload stores it: row ids everywhere, optional fields padded with null or
    // '', an absent ARES video padded into an empty group, `number` derived, keys in another order.
    const stored = {
      id: 42,
      uid: 'b1946ac9-2f6b-4e3f-9f0b-6c1c3a8f0d11',
      releaseFingerprint: FINGERPRINT,
      semver: '1.0.0',
      summaryTable: null,
      finalExplanation: null,
      unit: { focus: '', drivingQuestion: null },
      lessons: [
        {
          id: '65f0c0ffee',
          number: 1,
          resourceLinks: [
            {
              id: 'r1',
              fallback_search_url: 'http://ares.local/s',
              video: { title: '', source: null, has_transcript: false, tier: 0, direct_url: '' },
              reading: { id: 'g1', tier: 0, has_transcript: false, title: 'Cells' },
              phase: 'predict',
            },
          ],
          framework: [
            {
              id: 'f1',
              learnerExperience: 'Observe a leaf.',
              phase: 'Predict Phase',
              teacherMoves: '',
            },
          ],
          title: 'Lesson one',
          teacherReflection: null,
        },
      ],
      meta: {
        substrand_name: 'Cell Structure',
        substrand_id: '1.1',
        grade: 10,
        subject: 'Biology',
      },
      title: 'Cell Structure',
    }
    expect(releaseFingerprint(stored)).toBe(FINGERPRINT)
  })

  it('changes when the content changes, including one word of prose', () => {
    const edited = upload()
    edited.lessons[0].framework[0].learnerExperience = 'Observe a root.'
    expect(releaseFingerprint(edited)).not.toBe(FINGERPRINT)
    const renumbered = upload()
    renumbered.lessons.push({ ...renumbered.lessons[0], title: 'Lesson two' })
    expect(releaseFingerprint(renumbered)).not.toBe(FINGERPRINT)
  })

  it('a real resource record with every flag false is still content, not padding', () => {
    // Strings present, so the record is real even though has_transcript is false and tier is 0.
    expect(releaseFingerprintInput(upload())).toContain('"title":"Cells"')
  })
})

describe('identity is never content', () => {
  it('excludes uid and the fingerprint from copies and comparisons', () => {
    expect(DROP_KEYS.has('uid')).toBe(true)
    expect(DROP_KEYS.has('releaseFingerprint')).toBe(true)
    const a = { ...upload(), uid: 'one', releaseFingerprint: FINGERPRINT }
    const b = { ...upload(), uid: 'two', releaseFingerprint: null }
    expect(comparableContent(a)).toBe(comparableContent(b))
  })
})
