import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import {
  RESOURCE_PHASE_KEYS,
  aresResourceLinksToRows,
  isSafeHttpUrl,
  toAresResourceLinks,
  type AresResourceLinks,
  type StoredResourceLinkRow,
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

const links = (): AresResourceLinks =>
  Object.fromEntries(
    RESOURCE_PHASE_KEYS.map((phase) => [
      phase,
      {
        video: record(`${phase}-video`),
        reading: record(`${phase}-reading`),
        fallback_search_url: `http://ares.local/fallback/${phase}`,
      },
    ]),
  ) as AresResourceLinks

const storedLinks = () => aresResourceLinksToRows(links())

describe('definitive lesson resourceLinks contract', () => {
  it('accepts five native rows converted from the full ARES map', () => {
    expect(validateResourceLinks(storedLinks())).toEqual([])
  })

  it('uses the enclosing map key as the authoritative stored phase', () => {
    const value = links() as unknown as Record<string, Record<string, unknown>>
    value.predict!.phase = 'model'
    const rows = aresResourceLinksToRows(value) as StoredResourceLinkRow[]
    expect(rows[0]!.phase).toBe('predict')
  })

  it('allows explicit null recommendations but never a missing bucket', () => {
    const value = storedLinks()
    value[0]!.video = null
    value[0]!.reading = null
    expect(validateResourceLinks(value)).toEqual([])

    value.pop()
    expect(validateResourceLinks(value)).toContain(
      'resourceLinks.model: required phase resource row is missing.',
    )
  })

  it('rejects duplicate phases even when the array still has five rows', () => {
    const value = storedLinks()
    value[4] = { ...value[0]! }
    const problems = validateResourceLinks(value)
    expect(problems).toContain('resourceLinks[4].phase: duplicate resource phase "predict".')
    expect(problems).toContain('resourceLinks.model: required phase resource row is missing.')
  })

  it('rejects executable and non-HTTP hyperlink schemes', () => {
    expect(isSafeHttpUrl('http://ares.local/path')).toBe(true)
    expect(isSafeHttpUrl('https://ares.example/path')).toBe(true)
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,boom')).toBe(false)

    const value = storedLinks()
    value[1]!.video!.direct_url = 'javascript:alert(1)'
    expect(validateResourceLinks(value)).toContain(
      'resourceLinks.observe.video.direct_url: must be an http:// or https:// URL.',
    )
  })

  it('round-trips populated records and restores empty Payload groups to null', () => {
    const value = storedLinks()
    const dqb = value.find((row) => row.phase === 'dqb')!
    dqb.video = {
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
    const predict = value.find((row) => row.phase === 'predict')!
    expect(out.predict).toEqual({
      video: predict.video,
      reading: predict.reading,
      fallback_search_url: predict.fallback_search_url,
    })
  })
})

describe('resourceLinks save-as-new boundary', () => {
  it('restores existing lesson maps and accepts an exact stored map for a duplicated lesson', () => {
    const stored = storedLinks()
    const forged = storedLinks()
    forged[0]!.video!.title = 'forged'
    const duplicated = stored.map((row, index) => ({ ...row, id: `client-copy-${index}` }))
    const data = {
      lessons: [
        { id: 'existing', title: 'Edited title', resourceLinks: forged },
        { id: 'new-copy', title: 'Duplicated lesson', resourceLinks: duplicated },
      ],
    }
    const original = { lessons: [{ id: 'existing', title: 'Old title', resourceLinks: stored }] }

    preserveLessonResourceLinks(data, original)

    expect(data.lessons[0]!.resourceLinks).toBe(stored)
    expect(data.lessons[1]!.resourceLinks).toBe(stored)
  })

  it('strips invented or modified resource maps from a new lesson', () => {
    const stored = storedLinks()
    const forged = storedLinks()
    forged[0]!.video!.title = 'forged'
    const data = { lessons: [{ id: 'new', title: 'New lesson', resourceLinks: forged }] }
    const original = { lessons: [{ id: 'existing', title: 'Old title', resourceLinks: stored }] }

    preserveLessonResourceLinks(data, original)

    expect(data.lessons[0]).not.toHaveProperty('resourceLinks')
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
    first.predict.video!.title = 'first build'
    second.predict.video!.title = 'second build'

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
