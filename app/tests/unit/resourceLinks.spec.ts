import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  RESOURCE_PHASE_KEYS,
  isSafeHttpUrl,
  toAresResourceLinks,
  validateResourceLinks,
} from '../../src/ingest/resourceLinks'
import { preserveLessonResourceLinks } from '../../src/hooks/fieldSplit'

const require = createRequire(import.meta.url)
const { getAllPhaseResources, withStoredResourceLinks } = require('../../src/generator/vendor/aresResources.js') as {
  getAllPhaseResources: () => unknown
  withStoredResourceLinks: <T>(lessons: unknown[], build: () => T) => T
}

const record = (suffix: string) => ({
  title: `Title ${suffix}`,
  source: 'ARES',
  content_type: 'video',
  direct_url: `http://ares.local/content/${suffix}`,
  search_url: `http://ares.local/search/${suffix}`,
  search_terms: `terms ${suffix}`,
  exact_search_url: `https://ares.example/exact/${suffix}`,
  has_transcript: true,
  tier: 0,
})

const links = () =>
  Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((phase) => [
      phase,
      {
        video: record(`${phase}-video`),
        reading: record(`${phase}-reading`),
        fallback_search_url: `http://ares.local/fallback/${phase}`,
      },
    ]),
  )

describe('definitive lesson resourceLinks contract', () => {
  it('accepts the full five-bucket ARES map', () => {
    expect(validateResourceLinks(links())).toEqual([])
  })

  it('allows explicit null recommendations but never a missing bucket', () => {
    const value = links()
    value.predict.video = null as never
    value.predict.reading = null as never
    expect(validateResourceLinks(value)).toEqual([])

    delete (value as Record<string, unknown>).model
    expect(validateResourceLinks(value)).toContain(
      'resourceLinks.model: required phase resource group is missing.',
    )
  })

  it('rejects executable and non-HTTP hyperlink schemes', () => {
    expect(isSafeHttpUrl('http://ares.local/path')).toBe(true)
    expect(isSafeHttpUrl('https://ares.example/path')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,boom')).toBe(false)

    const value = links()
    value.observe.video.direct_url = 'javascript:alert(1)'
    expect(validateResourceLinks(value)).toContain(
      'resourceLinks.observe.video.direct_url: must be an http:// or https:// URL.',
    )
  })

  it('round-trips populated records and restores empty Payload groups to null', () => {
    const value = links()
    value.dqb.video = {
      title: null,
      source: null,
      content_type: null,
      direct_url: null,
      search_url: null,
      search_terms: null,
      exact_search_url: null,
      has_transcript: false,
      tier: null,
    } as never

    const out = toAresResourceLinks(value)
    expect(out.dqb.video).toBeNull()
    expect(out.predict).toEqual(value.predict)
  })
})

describe('resourceLinks save-as-new boundary', () => {
  it('restores existing lesson maps and strips caller-supplied maps from new lessons', () => {
    const stored = links()
    const forged = links()
    forged.predict.video.title = 'forged'
    const data = {
      lessons: [
        { id: 'existing', title: 'Edited title', resourceLinks: forged },
        { id: 'new', title: 'New lesson', resourceLinks: forged },
      ],
    }
    const original = { lessons: [{ id: 'existing', title: 'Old title', resourceLinks: stored }] }

    preserveLessonResourceLinks(data, original)

    expect(data.lessons[0]!.resourceLinks).toBe(stored)
    expect(data.lessons[1]).not.toHaveProperty('resourceLinks')
  })
})

describe('pure-Node generator resource bridge', () => {
  it('contains no subprocess, Python, recommender, or SQLite runtime path', () => {
    const shim = readFileSync(
      new URL('../../src/generator/vendor/aresResources.js', import.meta.url),
      'utf8',
    )
    expect(shim).not.toMatch(/require\(['"]node:child_process['"]\)/)
    expect(shim).not.toMatch(/\bexec(?:File)?Sync\s*\(/)
    expect(shim).not.toMatch(/\bpython3\b/)
    expect(shim).not.toMatch(/ares_recommender|ARES_DB_PATH|ares_content\.db/)
  })

  it('isolates concurrent builds with AsyncLocalStorage', async () => {
    let release!: () => void
    const barrier = new Promise<void>((resolve) => (release = resolve))
    const first = links()
    const second = links()
    first.predict.video.title = 'first build'
    second.predict.video.title = 'second build'

    const a = withStoredResourceLinks([{ resourceLinks: first }], async () => {
      await barrier
      return getAllPhaseResources()
    })
    const b = withStoredResourceLinks([{ resourceLinks: second }], async () => {
      release()
      await Promise.resolve()
      return getAllPhaseResources()
    })

    const [aResult, bResult] = await Promise.all([a, b])
    expect(aResult).toBe(first)
    expect(bResult).toBe(second)
  })

  it('throws on an over-read (more lookups than lessons) instead of returning blank resources', () => {
    // One queued lesson, two lookups: the second call must fail LOUDLY (the exact "called twice"
    // vendor drift the count guard exists to catch), not silently return EMPTY_ALL.
    expect(() =>
      withStoredResourceLinks([{ resourceLinks: links() }], () => {
        getAllPhaseResources() // consumes the single queued lesson
        getAllPhaseResources() // over-read → must throw
        return null
      }),
    ).toThrow(/called more times than/)
  })

  it('throws when fewer lessons are consumed than queued (post-build count check)', () => {
    // Two queued lessons, one lookup: the post-build assertion catches the under-read.
    expect(() =>
      withStoredResourceLinks([{ resourceLinks: links() }, { resourceLinks: links() }], () => {
        getAllPhaseResources()
        return null
      }),
    ).toThrow(/fewer than one per lesson/)
  })
})
