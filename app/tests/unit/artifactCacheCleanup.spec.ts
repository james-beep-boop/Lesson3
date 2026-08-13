import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let cacheDir: string
let priorCacheDir: string | undefined

beforeEach(async () => {
  priorCacheDir = process.env.ARTIFACT_CACHE_DIR
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lesson3-artifact-cache-'))
  process.env.ARTIFACT_CACHE_DIR = cacheDir
  vi.resetModules()
})

afterEach(async () => {
  if (priorCacheDir === undefined) delete process.env.ARTIFACT_CACHE_DIR
  else process.env.ARTIFACT_CACHE_DIR = priorCacheDir
  vi.restoreAllMocks()
  await fs.rm(cacheDir, { recursive: true, force: true })
})

describe('artifact cache temporary-file hygiene', () => {
  it('removes the per-write temp file when the atomic rename fails', async () => {
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'))
    const { putArtifact } = await import('../../src/generator/artifactCache')

    await expect(putArtifact('broken-write', Buffer.from('bytes'))).rejects.toThrow('rename failed')
    expect((await fs.readdir(cacheDir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    rename.mockRestore()
  })

  it('cleans stale temps left by a prior process on the first write', async () => {
    const stale = path.join(cacheDir, 'orphan.tmp')
    await fs.writeFile(stale, 'partial')
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await fs.utimes(stale, old, old)
    const { putArtifact } = await import('../../src/generator/artifactCache')

    await putArtifact('healthy-write', Buffer.from('bytes'))

    await expect(fs.access(stale)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
