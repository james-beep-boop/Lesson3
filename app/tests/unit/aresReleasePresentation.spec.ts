import { describe, expect, it } from 'vitest'
import {
  aresReleaseLabel,
  releaseDateLabel,
  releaseVersionLabel,
  officialUpdateNotice,
  newerOfficialForTeacher,
} from '../../src/lib/aresReleasePresentation'

const first = { id: 1, semver: '1.0.0', releaseFingerprint: 'first', aresReleaseDate: null }
const teacher = { id: 2, semver: '1.0.2', author: 7, lineage: [1], releaseFingerprint: null }
const official = {
  id: 3,
  semver: '2.0.0',
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
    expect(releaseDateLabel('2026-02-30')).toBeNull()
    expect(releaseDateLabel('bad')).toBeNull()
    expect(releaseDateLabel('2028-02-29')).toBe('29 Feb 2028')
  })

  it('dates the notice from the Official change and names its actual previous Official', () => {
    expect(officialUpdateNotice(change, official, history)).toBe(
      'Official updated to the ARES release of 14 Nov 2026 on 3 Dec 2026. The previous Official (1.0.2) is still in the version history.',
    )
    // sourceVersion/creation timestamps are deliberately different and cannot supply either claim.
    const unrelated = { ...official, sourceVersion: 1, createdAt: '2026-11-15T00:00:00Z' }
    expect(officialUpdateNotice(change, unrelated, history)).toBe(
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
      ).toBe('Official updated to an ARES release (date not stated) on 3 Dec 2026.')
    }
  })

  it('suggests the caller’s own latest save, only when its surviving ARES base is older', () => {
    expect(newerOfficialForTeacher(history, official, 7)).toBe(teacher)
    expect(newerOfficialForTeacher(history, official, 8)).toBeNull()
    expect(newerOfficialForTeacher(history, first, 7)).toBeNull()
    expect(newerOfficialForTeacher(history, teacher, 7)).toBeNull()
    expect(newerOfficialForTeacher(history, undefined, 7)).toBeNull()
    const currentSave = { ...teacher, id: 4, semver: '2.0.1', lineage: [1, 3] }
    expect(newerOfficialForTeacher([...history, currentSave], official, 7)).toBeNull()
    expect(newerOfficialForTeacher([teacher, official], official, 7)).toBeNull()
    expect(
      newerOfficialForTeacher([{ ...teacher, lineage: null }, official], official, 7),
    ).toBeNull()
  })
})
