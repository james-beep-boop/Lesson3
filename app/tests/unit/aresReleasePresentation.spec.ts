import { describe, expect, it } from 'vitest'
import {
  aresReleaseLabel,
  releaseVersionLabel,
  officialUpdateNotice,
  newerReleaseSuggestion,
} from '../../src/lib/aresReleasePresentation'
import { formatCalendarDay } from '../../src/lib/formatDate'

const createdAt = '2026-11-20T00:00:00Z'
const first = {
  id: 1,
  semver: '1.0.0',
  createdAt,
  releaseFingerprint: 'first',
  aresReleaseDate: null,
}
const teacher = {
  id: 2,
  semver: '1.0.2',
  createdAt,
  author: 7,
  lineage: [1],
  releaseFingerprint: null,
}
const official = {
  id: 3,
  semver: '2.0.0',
  createdAt,
  releaseFingerprint: 'second',
  aresReleaseDate: '2026-11-14',
  lineage: [1],
}
const history = [first, teacher, official]
const change = {
  officialChangedAt: '2026-12-03T15:00:00Z',
  officialChangedFrom: 2,
  officialChangedBy: null,
}

describe('ARES release presentation', () => {
  it('labels releases by their calendar date and fingerprint, never a version-number heuristic', () => {
    expect(releaseVersionLabel(official)).toBe('2.0.0 · ARES release 14 Nov 2026')
    expect(releaseVersionLabel(first)).toBe('1.0.0 · ARES release: not stated')
    expect(
      releaseVersionLabel({ ...teacher, semver: '3.0.0', aresReleaseDate: '2026-11-14' }),
    ).toBe('3.0.0')
    expect(aresReleaseLabel(teacher)).toBeNull()
    expect(formatCalendarDay('2026-02-30')).toBeNull()
    expect(formatCalendarDay('bad')).toBeNull()
    expect(formatCalendarDay('2028-02-29')).toBe('29 Feb 2028')
  })

  it('takes the notice from the Official change record and names its actual previous Official', () => {
    expect(officialUpdateNotice(change, official, history)).toEqual({
      release: '14 Nov 2026',
      changedAt: '2026-12-03T15:00:00Z',
      previousSemver: '1.0.2',
    })
    // sourceVersion/creation timestamps are deliberately different and cannot supply either claim.
    const unrelated = { ...official, sourceVersion: 1, createdAt: '2026-11-15T00:00:00Z' }
    expect(officialUpdateNotice(change, unrelated, history)).toEqual(
      officialUpdateNotice(change, official, history),
    )
  })

  it('omits unrecorded and human changes and does not invent deleted predecessors', () => {
    expect(
      officialUpdateNotice({ ...change, officialChangedAt: null }, official, history),
    ).toBeNull()
    expect(officialUpdateNotice({ ...change, officialChangedBy: 7 }, official, history)).toBeNull()
    expect(officialUpdateNotice(change, teacher, history)).toBeNull()
    expect(officialUpdateNotice(change, undefined, history)).toBeNull()
    expect(
      officialUpdateNotice({ ...change, officialChangedAt: 'bad' }, official, history),
    ).toBeNull()
    for (const previous of [null, 99]) {
      expect(
        officialUpdateNotice({ ...change, officialChangedFrom: previous }, first, history),
      ).toEqual({ release: null, changedAt: '2026-12-03T15:00:00Z', previousSemver: null })
    }
  })

  it('suggests the caller’s own latest save, only when its surviving ARES base is older', () => {
    expect(newerReleaseSuggestion(history, official, 7)).toEqual({
      ownId: 2,
      ownSemver: '1.0.2',
      officialId: 3,
    })
    expect(newerReleaseSuggestion(history, official, 8)).toBeNull()
    expect(newerReleaseSuggestion(history, first, 7)).toBeNull()
    expect(newerReleaseSuggestion(history, teacher, 7)).toBeNull()
    expect(newerReleaseSuggestion(history, undefined, 7)).toBeNull()
    const currentSave = { ...teacher, id: 4, semver: '2.0.1', lineage: [1, 3] }
    expect(newerReleaseSuggestion([...history, currentSave], official, 7)).toBeNull()
    expect(newerReleaseSuggestion([teacher, official], official, 7)).toBeNull()
    expect(
      newerReleaseSuggestion([{ ...teacher, lineage: null }, official], official, 7),
    ).toBeNull()
  })
})
