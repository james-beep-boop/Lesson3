import { describe, expect, it } from 'vitest'
import { comparableIngestContent } from '../../src/ingest/contentEquality'
import { RESOURCE_PHASE_KEYS, type StoredResourceLinkRow } from '../../src/ingest/resourceLinks'

describe('upload content comparison', () => {
  const lesson = () => ({
    number: 9,
    title: 'A lesson',
    framework: [{ phase: 'Predict Phase', learnerExperience: 'Keep this text' }],
    resourceLinks: RESOURCE_PHASE_KEYS.map((phase): StoredResourceLinkRow => ({
      phase,
      video: null,
      reading: null,
      fallback_search_url: `https://ares.example/${phase}`,
    })),
  })

  it('ignores storage padding and row ids, but preserves meaningful changes and array order', () => {
    const incoming = { title: 'Plan', lessons: [lesson()], unit: {}, summaryTable: {} }
    const stored = {
      ...incoming,
      unit: { name: null },
      summaryTable: { lessons: [], drivingQuestion: null },
      lessons: [{ ...lesson(), number: 1, id: 'row', overview: null }],
    }
    expect(comparableIngestContent(incoming)).toBe(comparableIngestContent(stored))
    expect(comparableIngestContent({ ...stored, title: 'New title' })).not.toBe(
      comparableIngestContent(incoming),
    )
    expect(
      comparableIngestContent({ ...stored, lessons: [{ ...lesson(), overview: ' ' }] }),
    ).not.toBe(comparableIngestContent(incoming))
    const second = { ...lesson(), title: 'Second lesson' }
    expect(comparableIngestContent({ lessons: [lesson(), second] })).not.toBe(
      comparableIngestContent({ lessons: [second, lesson()] }),
    )
    const alteredResources = lesson()
    alteredResources.resourceLinks[0].fallback_search_url = 'https://ares.example/changed'
    expect(comparableIngestContent({ lessons: [lesson()] })).not.toBe(
      comparableIngestContent({ lessons: [alteredResources] }),
    )
  })
})
