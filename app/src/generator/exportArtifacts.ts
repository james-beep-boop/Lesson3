/**
 * Export artifact production + retrieval (SPEC §9) — the shared core behind BOTH the
 * synchronous export endpoint (warm-cache path) and the async `generateArtifact` job
 * (cold/heavy path), so the two can never drift on cache keys, filenames, or zip layout.
 *
 * MODEL: a bundle export is up to three deliverables (LessonSequence always; FinalExplanation
 * + SummaryTable for some sub-strands). Generation is content-stable, so each deliverable's
 * bytes are cached by (bundle, lockVersion, format, kind, doc). A small MANIFEST entry —
 * written LAST, after every deliverable — records which docs exist and their filenames; its
 * presence is the "this export is fully ready" sentinel the warm path and status poll check.
 *
 * AUTHORIZATION is NOT here. Callers (the endpoint at enqueue time; nothing re-checks in the
 * job, which is a trusted system path) must enforce the caller's READ access + published-only
 * BEFORE producing/serving. This module fetches with overrideAccess like `generateForBundle`.
 */
import { createRequire } from 'node:module'
import type { Payload } from 'payload'

import { generateForBundle } from './generateForBundle'
import { artifactKey, getArtifact, putArtifact } from './artifactCache'
import type { LessonSequenceFormat } from './index'
import type { LessonBundle } from '../payload-types'

const require = createRequire(import.meta.url)
const JSZip = require('jszip') as new () => {
  file(name: string, data: Buffer): void
  generateAsync(opts: { type: 'nodebuffer' }): Promise<Buffer>
}

export type ExportKind = 'docx' | 'pdf'

/** The four inputs that fully determine an export's artifacts (its cache identity). */
export interface ArtifactSpec {
  bundleId: number | string
  /** The published bundle's lockVersion — the cache-buster (bumps on every update). */
  lockVersion: number | null | undefined
  format: LessonSequenceFormat
  kind: ExportKind
}

/** One deliverable's stable cache tag + its download filename stem (no extension). */
interface DocMeta {
  tag: string
  name: string
}

/** The manifest written once all deliverables are cached: the export's "ready" sentinel. */
interface Manifest {
  docs: DocMeta[]
}

const MANIFEST_DOC = '__manifest__'

const extFor = (kind: ExportKind): string => (kind === 'pdf' ? 'pdf' : 'docx')

/** Strip a stored filePrefix to a safe bare filename component (no path/traversal). */
export const safePrefix = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '').replace(/[^A-Za-z0-9._-]/g, '_') || 'bundle'

const keyFor = (spec: ArtifactSpec, doc: string): string =>
  artifactKey({
    bundleId: spec.bundleId,
    lockVersion: spec.lockVersion,
    format: spec.format,
    kind: spec.kind,
    doc,
  })

/** Build the ordered deliverable list (tag + filename stem) from a bundle's filePrefix. */
function docListFor(prefix: string, docx: Awaited<ReturnType<typeof generateForBundle>>): DocMeta[] {
  const docs: DocMeta[] = [{ tag: 'lessonSequence', name: `${prefix}_CBE_LessonSequence` }]
  if (docx.finalExplanation) docs.push({ tag: 'finalExplanation', name: `${prefix}_FinalExplanation` })
  if (docx.summaryTable) docs.push({ tag: 'summaryTable', name: `${prefix}_SummaryTable` })
  return docs
}

/** Zip a set of named byte blobs (filenames already include the extension). */
async function zipEntries(entries: { name: string; bytes: Buffer }[]): Promise<Buffer> {
  const zip = new JSZip()
  for (const e of entries) zip.file(e.name, e.bytes)
  return zip.generateAsync({ type: 'nodebuffer' })
}

/**
 * COLD PATH (job / first request): generate the three DOCX, convert to PDF if requested,
 * cache every deliverable, then write the manifest sentinel. Idempotent — re-running simply
 * rewrites identical bytes. `convert` is injected so this module need not import the PDF seam
 * directly (keeps the converter dependency at the call site). Returns the deliverable list.
 *
 * NOTE on staleness: keys use `spec.lockVersion` (the enqueue-time value), but content is read
 * fresh here. If the bundle advanced between enqueue and run, the (rare) result is newer content
 * cached under the older version key — harmless, since the next request's new lockVersion misses.
 */
export async function produceArtifacts(
  payload: Payload,
  spec: ArtifactSpec,
  convert: (docx: Buffer, filename: string) => Promise<Buffer>,
): Promise<DocMeta[]> {
  const generated = await generateForBundle(payload, spec.bundleId, spec.format)
  const bundle = (await payload.findByID({
    collection: 'lesson-bundles',
    id: spec.bundleId,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundle
  const prefix = safePrefix(bundle.meta?.filePrefix)
  const docs = docListFor(prefix, generated)
  // `generated` is already keyed by deliverable tag; docListFor only lists ones that exist.
  const docxFor = (tag: string): Buffer => (generated as unknown as Record<string, Buffer>)[tag]

  // Convert (the heavy step — PDF only) concurrently, capped at docs.length (≤3) onto the single
  // Gotenberg sidecar, matching the prior synchronous endpoint's fan-out; then cache each.
  const entries = await Promise.all(
    docs.map(async (d) => ({
      tag: d.tag,
      bytes: spec.kind === 'pdf' ? await convert(docxFor(d.tag), `${d.name}.docx`) : docxFor(d.tag),
    })),
  )
  for (const e of entries) await putArtifact(keyFor(spec, e.tag), e.bytes)

  // Manifest LAST — its presence means every deliverable above is already cached.
  await putArtifact(keyFor(spec, MANIFEST_DOC), Buffer.from(JSON.stringify({ docs } satisfies Manifest)))
  return docs
}

/**
 * WARM PATH (endpoint): if the manifest and every deliverable it lists are cached, assemble
 * and return the export zip; otherwise return null (caller falls back to the async path). Never
 * generates or converts — a pure cache read, so it can't tie up a worker.
 */
export async function loadCachedExportZip(spec: ArtifactSpec): Promise<Buffer | null> {
  const manifestBytes = await getArtifact(keyFor(spec, MANIFEST_DOC))
  if (!manifestBytes) return null

  let manifest: Manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8')) as Manifest
  } catch {
    return null // corrupt manifest → treat as a miss; the cold path will rewrite it
  }

  const ext = extFor(spec.kind)
  const entries: { name: string; bytes: Buffer }[] = []
  for (const d of manifest.docs) {
    const bytes = await getArtifact(keyFor(spec, d.tag))
    if (!bytes) return null // a deliverable was evicted → incomplete; regenerate
    entries.push({ name: `${d.name}.${ext}`, bytes })
  }
  return zipEntries(entries)
}

/** True once an export's manifest is cached (used by the status poll to detect readiness). */
export async function isExportReady(spec: ArtifactSpec): Promise<boolean> {
  return (await getArtifact(keyFor(spec, MANIFEST_DOC))) !== null
}
