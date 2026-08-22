/**
 * Manage → System → Deployment: the facts, as a pure-ish function.
 *
 * ⚑ THE PROPERTY UNDER TEST IS "NEVER THROWS", and it needs a test because the failure mode is the
 * worst kind: this panel probes a network sidecar and stats a directory, and an unhandled rejection in
 * either would take down the whole Manage page — for a Site Admin, and most likely at exactly the
 * moment they opened it BECAUSE something was already broken. "PDF engine: not reachable" is useful;
 * a 500 on Manage teaches them nothing and hides the other five facts.
 *
 * The second property is that every fact NAMES ITS ENV VAR. That is not cosmetic: these settings are
 * decided at boot, so the panel's whole job is to say where to change them (D1: "A toggle that
 * silently does nothing until restart is worse than no toggle… it must look like it").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectSystemFacts, type SystemFact } from '@/lib/systemFacts'

const ENV_KEYS = [
  'SERVER_URL',
  'PUBLIC_LIBRARY_ENABLED',
  'SMTP_HOST',
  'SENTRY_DSN',
  'GOTENBERG_URL',
  'ARTIFACT_CACHE_DIR',
  'ARTIFACT_CACHE_MAX_BYTES',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  // A directory that cannot exist, so the cache probe takes its failure path unless a case says
  // otherwise. Pointing at a real temp dir would test the filesystem; this tests the handler.
  process.env.ARTIFACT_CACHE_DIR = '/nonexistent/lesson3-facts-spec'
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.unstubAllGlobals()
})

const byKey = (facts: SystemFact[], key: string): SystemFact => {
  const fact = facts.find((f) => f.key === key)
  if (!fact) throw new Error(`no fact named ${key}; got ${facts.map((f) => f.key).join(', ')}`)
  return fact
}

describe('collectSystemFacts', () => {
  it('never throws, even when the probe rejects and the cache directory is unreadable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    )
    const facts = await collectSystemFacts()
    // Both failure paths taken at once, and the panel still has every row.
    expect(byKey(facts, 'pdfEngine').status).toBe('unknown')
    expect(byKey(facts, 'artifactCache').status).toBe('unknown')
    expect(facts).toHaveLength(6)
  })

  it('reports the PDF engine reachable when the sidecar answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok', { status: 200 }))),
    )
    const pdf = byKey(await collectSystemFacts(), 'pdfEngine')
    expect(pdf.status).toBe('ok')
    // ⚑ Says it is LOCAL, because "PDF engine" is the component people assume needs internet.
    expect(pdf.detail).toContain('no internet')
  })

  it('distinguishes "answered badly" from "did not answer"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))),
    )
    const pdf = byKey(await collectSystemFacts(), 'pdfEngine')
    expect(pdf.status).toBe('unknown')
    expect(pdf.value).toContain('503')
  })

  it('reads unset capabilities as OFF, which is a legitimate state and not a fault', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const facts = await collectSystemFacts()
    // An offline ARES school has all of these unset by design; nothing here may read as an error.
    for (const key of ['serverUrl', 'publicLibrary', 'email', 'errorTracking']) {
      expect(byKey(facts, key).status, `${key} should be off, not unknown`).toBe('off')
    }
  })

  it('flips those to OK when the environment provides them', async () => {
    process.env.SERVER_URL = 'https://lessons.example.org'
    process.env.PUBLIC_LIBRARY_ENABLED = '1'
    process.env.SMTP_HOST = 'smtp.example.org'
    process.env.SENTRY_DSN = 'https://key@sentry.example.org/1'
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const facts = await collectSystemFacts()
    for (const key of ['serverUrl', 'publicLibrary', 'email', 'errorTracking']) {
      expect(byKey(facts, key).status, key).toBe('ok')
    }
    expect(byKey(facts, 'serverUrl').value).toBe('https://lessons.example.org')
  })

  it('names the environment variable for every fact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const missing = (await collectSystemFacts()).filter((f) => !f.envVar).map((f) => f.key)
    expect(
      missing,
      'a boot-time fact without its env var is a dead end for whoever must fix it',
    ).toEqual([])
  })

  it('only ever reports one of the three statuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    const statuses = new Set((await collectSystemFacts()).map((f) => f.status))
    for (const s of statuses) expect(['ok', 'off', 'unknown']).toContain(s)
  })
})
