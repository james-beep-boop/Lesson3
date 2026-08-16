/**
 * Artifact cache (SPEC §9) — a bounded on-disk cache of generated DOCX/PDF bytes.
 *
 * WHY: generation is *content-stable* — a given (bundle, version, document, kind)
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
 * safe filename. Immutable-version scopes include the generator-render version, so a deliberate
 * generator upgrade cannot serve bytes produced by the prior renderer.
 *
 * LOCATION: `ARTIFACT_CACHE_DIR` (on the Rock, a bind-mounted host dir under
 * `/srv/lesson3/out` so entries survive container `--rm`). Falls back to a local dir for
 * dev. EVICTION: oldest-first by mtime once total size exceeds `ARTIFACT_CACHE_MAX_BYTES`.
 */
import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { positiveIntEnv } from '../lib/env'

const CACHE_DIR =
  process.env.ARTIFACT_CACHE_DIR || path.join(process.cwd(), '.artifact-cache')

// Fail fast on a malformed override rather than the old `Number(env) || default`, which would
// silently ignore a typo and keep the 512 MB default (audit 2026-07-05, Codex #7).
const MAX_BYTES = positiveIntEnv('ARTIFACT_CACHE_MAX_BYTES', 512 * 1024 * 1024) // 512 MB
const STALE_TMP_AGE_MS = 60 * 60 * 1000
let staleTempCleanup: Promise<void> | null = null

async function removeStaleTempFiles(): Promise<void> {
  const cutoff = Date.now() - STALE_TMP_AGE_MS
  const names = await fs.readdir(CACHE_DIR).catch(() => [])
  await Promise.all(
    names
      .filter((name) => name.endsWith('.tmp'))
      .map(async (name) => {
        const file = path.join(CACHE_DIR, name)
        try {
          const stat = await fs.stat(file)
          if (stat.mtimeMs < cutoff) await fs.unlink(file)
        } catch {
          // Best-effort startup hygiene: another writer/cleaner may have won the race.
        }
      }),
  )
}

/**
 * Build a stable cache key from its parts. Each part is coerced to a string and joined with
 * a delimiter that cannot appear inside the structured parts (scope, enums, filenames).
 *
 * `scope` is an opaque identity string chosen by the caller —
 * `render:<generatorVersion>:version:<id>` for an immutable snapshot. Keeping the cache key
 * generator-agnostic keeps storage mechanics separate from renderer identity.
 */
export function artifactKey(parts: {
  scope: string
  kind: 'docx' | 'pdf'
  doc: string
}): string {
  return [parts.scope, parts.kind, parts.doc].join('::')
}

/** Map a key to its on-disk path (sha256 → hex filename; never path-derived from user input). */
function fileForKey(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex')
  return path.join(CACHE_DIR, `${hash}.bin`)
}

/** Cheap existence check (no read, no mtime touch) — for readiness polling that must not load bytes. */
export async function hasArtifact(key: string): Promise<boolean> {
  try {
    await fs.access(fileForKey(key))
    return true
  } catch {
    return false
  }
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
  staleTempCleanup ??= removeStaleTempFiles()
  await staleTempCleanup
  const file = fileForKey(key)
  // Per-WRITE unique temp (pid + uuid): two concurrent jobs producing the same key (duplicate
  // cold exports) must not share a temp path and clobber each other's write before rename.
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(tmp, bytes)
    await fs.rename(tmp, file)
  } finally {
    // rename removes the temp on success; unlink closes interrupted-write leaks on failure.
    // Cleanup is best-effort so an unlink fault cannot mask the original write/rename failure.
    await fs.unlink(tmp).catch(() => {})
  }
  await evictIfNeeded()
}

/**
 * Run a cache operation best-effort: never fail the caller, but make the FIRST failure of each kind
 * visible.
 *
 * ⚑ WHY THIS EXISTS RATHER THAN `.catch(() => null)` AT EACH CALL SITE. Both HTML caches swallowed
 * every cache error silently, and the failure mode that hides is the expensive one: a permissions
 * fault, a full disk or an exhausted file-descriptor table makes every read miss AND every write
 * fail, so the process silently repeats full DOCX generation, Mammoth conversion, sanitization and
 * HTML diffing on every single request — with the cache reporting nothing at all. The system looks
 * healthy and merely runs at a fraction of its speed, which is the hardest kind of fault to find.
 *
 * ⚑ A MISS IS NOT A FAILURE and must not log. `getArtifact` already returns null for `ENOENT` — the
 * ordinary cold-cache case — and throws only for real faults, so only genuine faults reach here.
 * That distinction lives in `getArtifact`; do not reintroduce a catch that erases it.
 *
 * Logged ONCE per operation kind. A broken cache fails on every request, so an unbounded log would
 * bury the signal it exists to raise; the guard set is bounded to two entries by construction and
 * cannot grow into a leak the way an error-keyed set would.
 */
type CacheOperation = 'read' | 'write'
const warnedCacheOperations = new Set<CacheOperation>()

export async function bestEffortArtifact<T>(
  logger: { warn: (obj: unknown, msg: string) => void },
  operation: CacheOperation,
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (!warnedCacheOperations.has(operation)) {
      warnedCacheOperations.add(operation)
      logger.warn(
        { err, operation, cacheDir: CACHE_DIR },
        'Artifact cache unavailable — falling back to uncached generation. This is a PERFORMANCE fault, not a correctness one: responses stay correct while every request repeats the full render. Check the cache directory’s existence, permissions and free space.',
      )
    }
    return fallback
  }
}

/** Test seam: forget which operations have already warned, so a spec can assert the once-only rule. */
export function resetArtifactCacheWarnings(): void {
  warnedCacheOperations.clear()
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
