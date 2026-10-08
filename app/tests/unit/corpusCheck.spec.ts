/**
 * `scripts/corpus-check.ts` is the whole-corpus render check run on every generator re-pin. A checker that
 * can go green while checking nothing is worse than none, so these pin its FAIL-CLOSED behaviour: malformed
 * JSON, an empty folder and a manifest-only folder all exit non-zero; a valid manifest is skipped but counted.
 * (The success path — a real bundle rendering end to end — is exercised by running it on the corpus.)
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(__dirname, '../../scripts/corpus-check.ts')
const dirs: string[] = []

function run(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'corpus-check-'))
  dirs.push(dir)
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(dir, name), body)
  const result = spawnSync('npx', ['tsx', SCRIPT], {
    env: { ...process.env, ARES_CORPUS_DIR: dir },
    encoding: 'utf8',
  })
  return { status: result.status, out: `${result.stdout}${result.stderr}` }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('corpus-check fails closed', () => {
  it('malformed JSON is a failure, not a skip', () => {
    const { status, out } = run({ 'bundle.json': '{ "META": ' })
    expect(status).toBe(1)
    expect(out).toContain('bundle.json is not valid JSON')
    expect(out).not.toContain('✓')
  }, 60_000)

  it('an empty folder checks nothing and fails', () => {
    const { status, out } = run({})
    expect(status).toBe(1)
    expect(out).toContain('no bundle was checked')
    expect(out).not.toContain('✓')
  }, 60_000)

  it('a folder of only manifests checks nothing and fails, but reports them as skipped', () => {
    const { status, out } = run({ 'manifest.json': '{"files":[]}', 'quiz.json': '[]' })
    expect(status).toBe(1)
    expect(out).toContain('valid JSON skipped as not a bundle: 2')
    expect(out).toContain('no bundle was checked')
    expect(out).not.toContain('✓')
  }, 60_000)

  it('one bad file fails the run even beside skipped manifests', () => {
    const { status, out } = run({ 'manifest.json': '{}', 'broken.json': 'nope' })
    expect(status).toBe(1)
    expect(out).toContain('broken.json is not valid JSON')
  }, 60_000)
})
