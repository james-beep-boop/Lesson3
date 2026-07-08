/**
 * Export artifact production + retrieval (SPEC §9) — the shared core behind BOTH the
 * synchronous export endpoint (warm-cache path) and the async `generateArtifact` job
 * (cold/heavy path), so the two can never drift on cache keys, filenames, or zip layout.
 *
 * MODEL: a bundle export is up to three deliverables (LessonSequence always; FinalExplanation
 * + SummaryTable for some sub-strands). Generation is content-stable, so each deliverable's
 * bytes are cached by (scope, kind, doc). A small MANIFEST entry —
 * written LAST, after every deliverable — records which docs exist and their filenames; its
 * presence is the "this export is fully ready" sentinel the warm path and status poll check.
 *
 * AUTHORIZATION is NOT here. Callers (the endpoint at enqueue time; nothing re-checks in the
 * job, which is a trusted system path) must enforce the caller's READ access BEFORE
 * producing/serving. This module fetches with overrideAccess like `generateForVersion`.
 */
import { createRequire } from 'node:module'

import { artifactKey, getArtifact, hasArtifact, putArtifact } from './artifactCache'
import type { GeneratedDocx } from './index'

const require = createRequire(import.meta.url)
const JSZip = require('jszip') as new () => {
  file(name: string, data: Buffer): void
  generateAsync(opts: { type: 'nodebuffer' }): Promise<Buffer>
}

export type ExportKind = 'docx' | 'pdf'

/** The inputs that fully determine an export's artifacts (its cache identity). */
export interface ArtifactSpec {
  /** Opaque, content-stable identity: `version:<id>` (an immutable snapshot — never changes). */
  scope: string
  kind: ExportKind
}

/** Cache scope for an immutable version snapshot (no cache-buster — the bytes never change). */
export const versionScope = (versionId: number | string): string => `version:${versionId}`

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

/** Every deliverable tag a version export can contain (the manifest lists which exist). */
export const DELIVERABLE_TAGS = ['lessonSequence', 'finalExplanation', 'summaryTable'] as const
export type DeliverableTag = (typeof DELIVERABLE_TAGS)[number]

const extFor = (kind: ExportKind): string => (kind === 'pdf' ? 'pdf' : 'docx')

/** Strip a stored filePrefix to a safe bare filename component (no path/traversal). */
export const safePrefix = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '').replace(/[^A-Za-z0-9._-]/g, '_') || 'bundle'

const keyFor = (spec: ArtifactSpec, doc: string): string =>
  artifactKey({ scope: spec.scope, kind: spec.kind, doc })

/** Build the ordered deliverable list (tag + filename stem) from a filePrefix. */
function docListFor(prefix: string, docx: GeneratedDocx): DocMeta[] {
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
 * COLD PATH (job / first request): given the already-generated DOCX and the filePrefix, convert
 * to PDF if requested, cache every deliverable, then write the manifest sentinel. Idempotent —
 * re-running simply rewrites identical bytes. `convert` is injected so this module need not import
 * the PDF seam directly (keeps the converter dependency at the call site). Returns the deliverable
 * list. Generator-agnostic: the caller chooses the generator (bundle or version) and passes the
 * result + prefix, so the cache layer stays decoupled from the data model.
 */
export async function produceArtifacts(
  spec: ArtifactSpec,
  generated: GeneratedDocx,
  prefix: string,
  convert: (docx: Buffer, filename: string) => Promise<Buffer>,
): Promise<DocMeta[]> {
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
  const manifest = await readManifest(spec)
  if (!manifest) return null

  const ext = extFor(spec.kind)
  const entries: { name: string; bytes: Buffer }[] = []
  for (const d of manifest.docs) {
    const bytes = await getArtifact(keyFor(spec, d.tag))
    if (!bytes) return null // a deliverable was evicted → incomplete; regenerate
    entries.push({ name: `${d.name}.${ext}`, bytes })
  }
  return zipEntries(entries)
}

/**
 * True only when the export is FULLY downloadable: the manifest AND every deliverable it lists
 * are present. The status poll uses this — checking the manifest alone would report "ready" after
 * a deliverable was evicted, so the client's download would then re-enqueue and look like a failure.
 * Mirrors exactly what `loadCachedExportZip` requires, but cheaply (existence checks, no byte reads).
 */
export async function isExportReady(spec: ArtifactSpec): Promise<boolean> {
  const manifest = await readManifest(spec)
  if (!manifest) return false
  const present = await Promise.all(manifest.docs.map((d) => hasArtifact(keyFor(spec, d.tag))))
  return present.every(Boolean)
}

/** Read + parse the manifest sentinel, or null when missing/corrupt (a miss either way — the cold
 *  path rewrites it). Single owner for the read the zip/ready/deliverable paths all share. */
async function readManifest(spec: ArtifactSpec): Promise<Manifest | null> {
  const manifestBytes = await getArtifact(keyFor(spec, MANIFEST_DOC))
  if (!manifestBytes) return null
  try {
    return JSON.parse(manifestBytes.toString('utf8')) as Manifest
  } catch {
    return null
  }
}

/** One deliverable's serve-ready bytes, or why not: `cold` = manifest/bytes missing (prepare
 *  first — indistinguishable from eviction, same remedy), `absent` = the export is ready and this
 *  version genuinely has no such document (e.g. no Final Explanation for this sub-strand). */
export type DeliverableResult =
  | { state: 'ready'; filename: string; bytes: Buffer }
  | { state: 'cold' }
  | { state: 'absent' }

/**
 * WARM PATH (per-document endpoint): serve ONE deliverable from the cache (teacher-first track T1,
 * DECISIONS 2026-07-08). Same never-generates contract as `loadCachedExportZip`; the filename comes
 * from the manifest so it matches the zip's entry name exactly.
 */
export async function loadCachedDeliverable(
  spec: ArtifactSpec,
  tag: DeliverableTag,
): Promise<DeliverableResult> {
  const manifest = await readManifest(spec)
  if (!manifest) return { state: 'cold' }
  const doc = manifest.docs.find((d) => d.tag === tag)
  if (!doc) return { state: 'absent' }
  const bytes = await getArtifact(keyFor(spec, doc.tag))
  if (!bytes) return { state: 'cold' } // evicted → incomplete; a re-prepare rewrites it
  return { state: 'ready', filename: `${doc.name}.${extFor(spec.kind)}`, bytes }
}
