/**
 * Artifact cache (SPEC §9) — a bounded on-disk cache of generated DOCX/PDF bytes.
 *
 * WHY: generation is *content-stable* — a given (bundle, version, document, format, kind)
 * always produces identical bytes (the same rule that lets §9 reference an artifact by a
 * stable, version-pinned URL). So once generated, the bytes can be served again for free,
 * skipping both the generator and the Gotenberg conversion. This defuses most of the
 * readiness-#1 DoS surface: repeat exports become a disk read, not CPU + sidecar work.
 *
 * SCOPE: deliberately NOT a Payload media/storage layer (SPEC §9 defers persistence and
 * warns against reintroducing one). It is a plain content-addressed file cache behind a
 * seam, so it can later be swapped for object storage without touching callers.
 *
 * KEY: callers build a stable key string from the cache-busting inputs; we hash it to a
 * safe filename. `lockVersion` is the cache-buster — it increments on every bundle update
 * (edit or republish), so stale bytes are never served for a changed bundle.
 *
 * LOCATION: `ARTIFACT_CACHE_DIR` (on the Rock, a bind-mounted host dir under
 * `/srv/lesson3/out` so entries survive container `--rm`). Falls back to a local dir for
 * dev. EVICTION: oldest-first by mtime once total size exceeds `ARTIFACT_CACHE_MAX_BYTES`.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const CACHE_DIR =
  process.env.ARTIFACT_CACHE_DIR || path.join(process.cwd(), '.artifact-cache')

const MAX_BYTES = Number(process.env.ARTIFACT_CACHE_MAX_BYTES) || 512 * 1024 * 1024 // 512 MB

/**
 * Build a stable cache key from its parts. Each part is coerced to a string and joined with
 * a delimiter that cannot appear inside the structured parts (ids, ints, enums, filenames).
 */
export function artifactKey(parts: {
  bundleId: string | number
  lockVersion: number | null | undefined
  format: string
  kind: 'docx' | 'pdf'
  doc: string
}): string {
  return [parts.bundleId, parts.lockVersion ?? 0, parts.format, parts.kind, parts.doc].join('::')
}

/** Map a key to its on-disk path (sha256 → hex filename; never path-derived from user input). */
function fileForKey(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex')
  return path.join(CACHE_DIR, `${hash}.bin`)
}

/** Return cached bytes for a key, or null on a miss. A read also refreshes mtime (LRU touch). */
export async function getArtifact(key: string): Promise<Buffer | null> {
  const file = fileForKey(key)
  try {
    const bytes = await fs.readFile(file)
    // Touch mtime so frequently-read entries survive eviction (best-effort).
    const now = new Date()
    void fs.utimes(file, now, now).catch(() => {})
    return bytes
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * Store bytes under a key. Atomic (temp file + rename) so a concurrent reader never sees a
 * half-written artifact. Evicts oldest entries afterwards if over the size cap.
 */
export async function putArtifact(key: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true })
  const file = fileForKey(key)
  const tmp = path.join(CACHE_DIR, `.${createHash('sha256').update(key).digest('hex')}.${process.pid}.tmp`)
  await fs.writeFile(tmp, bytes)
  await fs.rename(tmp, file)
  await evictIfNeeded()
}

/** Delete oldest-by-mtime files until total size is back under the cap. Best-effort. */
async function evictIfNeeded(): Promise<void> {
  let names: string[]
  try {
    names = await fs.readdir(CACHE_DIR)
  } catch {
    return
  }
  const stats = await Promise.all(
    names
      .filter((n) => n.endsWith('.bin'))
      .map(async (n) => {
        const p = path.join(CACHE_DIR, n)
        try {
          const s = await fs.stat(p)
          return { p, size: s.size, mtime: s.mtimeMs }
        } catch {
          return null
        }
      }),
  )
  const entries = stats.filter((s): s is { p: string; size: number; mtime: number } => s !== null)
  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= MAX_BYTES) return
  entries.sort((a, b) => a.mtime - b.mtime) // oldest first
  for (const e of entries) {
    if (total <= MAX_BYTES) break
    try {
      await fs.unlink(e.p)
      total -= e.size
    } catch {
      // raced with another evictor / reader; skip
    }
  }
}

/** Test/diagnostic helper: where the cache lives. */
export function artifactCacheDir(): string {
  return CACHE_DIR
}
