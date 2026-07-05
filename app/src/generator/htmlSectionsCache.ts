/**
 * Cached content-HTML sections for an immutable lesson-plan VERSION (SPEC §5 content-preview tier;
 * audit 2026-07-04 Phase 3 scale prep).
 *
 * WHY: the lesson detail page (`app/(frontend)/lessons/[id]`) and the GET `/preview` endpoint both
 * render a saved version by running the full generator (up to 3 `Packer.toBuffer` DOCX builds) →
 * mammoth DOCX→HTML → DOMPurify, on EVERY request — seconds of CPU on the Rock's 2-CPU budget, on
 * the most-trafficked path. A version is IMMUTABLE, so its rendered sections never change: cache
 * the sanitized `PreviewSection[]` by version id and every later view is a disk read. This is the
 * same content-stability property the DOCX/PDF artifact cache already exploits; it reuses that
 * cache's store (dir, LRU eviction, size cap), so HTML entries — a few KB each — just age out.
 *
 * SCOPE: SAVED versions only. The POST `/preview` (unsaved working-copy) path must NEVER be cached
 * — it renders caller-submitted, unpersisted content — so it keeps calling `renderBundlePreview`
 * directly.
 *
 * INVALIDATION: none by version (immutable + serial ids are never reused). The one thing that CAN
 * change the output for a fixed version is OUR render code (a mammoth bump, a sanitizer-allowlist
 * change, a generator tweak). {@link HTML_RENDER_CACHE_VERSION} is baked into the key for exactly
 * that: bump it in the SAME commit as any render-logic change and every stale HTML entry is
 * bypassed (old entries then age out via LRU). A benign one-time cold-start, like the artifact
 * cache's on a key-shape change.
 */
import type { Payload } from 'payload'

import { getArtifact, putArtifact } from './artifactCache'
import { generateForVersion } from './generateForVersion'
import { docxToSections, type PreviewSection } from './previewBundle'

/** Bump in lockstep with any change to generator / mammoth / sanitizer render output. */
const HTML_RENDER_CACHE_VERSION = 1

const keyFor = (versionId: number | string): string =>
  `html-sections::v${HTML_RENDER_CACHE_VERSION}::version:${versionId}`

/**
 * Return the sanitized content-HTML sections for a saved version, from cache when present, else
 * generate + render + cache. `generateForVersion` fetches the version with overrideAccess — a
 * TRUSTED SYSTEM read, NOT an authorization boundary: the caller MUST have already enforced the
 * requester's READ access to this version (the lesson page loads it access-gated; the GET preview
 * endpoint runs `findReadableVersion` first). A cache write failure never breaks the render — the
 * bytes were produced, so log-free best-effort: on any cache error we still return freshly-rendered
 * sections.
 */
export async function renderVersionSectionsCached(
  payload: Payload,
  versionId: number | string,
): Promise<PreviewSection[]> {
  const key = keyFor(versionId)

  const cached = await getArtifact(key).catch(() => null)
  if (cached) {
    try {
      return JSON.parse(cached.toString('utf8')) as PreviewSection[]
    } catch {
      // Corrupt entry → treat as a miss and rewrite below.
    }
  }

  const sections = await docxToSections(await generateForVersion(payload, versionId))
  await putArtifact(key, Buffer.from(JSON.stringify(sections))).catch(() => {})
  return sections
}
