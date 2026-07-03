/**
 * Verify the Stage-2 version EXPORT production + cache path end-to-end (DOCX and PDF), without HTTP.
 *
 * Exercises exactly what the cold export endpoint delegates to: generateForVersion → produceArtifacts
 * (convert + cache + manifest) → isExportReady → loadCachedExportZip. The HTTP layer on top is thin
 * and separately auth-gated (401 unauth, verified). PDF runs each DOCX through the Gotenberg seam.
 *
 * Read-only w.r.t. app data (writes only to the artifact cache, which is its purpose). Run on the Rock:
 *   cd app && npx payload run scripts/verify-stage2-export.ts
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { generateForVersion } from '../src/generator/generateForVersion'
import {
  isExportReady,
  loadCachedExportZip,
  produceArtifacts,
  safePrefix,
  versionScope,
  type ArtifactSpec,
  type ExportKind,
} from '../src/generator/exportArtifacts'
import { docxToPdf } from '../src/generator/docxToPdf'
import type { LessonBundleVersion } from '../src/payload-types'

const run = async () => {
  const payload = await getPayload({ config })

  // Pick the first plan's Official version as the subject.
  const { docs: plans } = await payload.find({
    collection: 'lesson-plans',
    where: { officialVersion: { exists: true } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const officialId =
    typeof plans[0]?.officialVersion === 'object'
      ? plans[0]?.officialVersion?.id
      : plans[0]?.officialVersion
  if (officialId == null) throw new Error('No plan with an Official version found.')

  const version = (await payload.findByID({
    collection: 'lesson-bundle-versions',
    id: officialId,
    depth: 0,
    overrideAccess: true,
  })) as LessonBundleVersion
  const prefix = safePrefix(version.meta?.filePrefix)
  console.log(`Subject: version ${officialId} "${version.title}" (prefix ${prefix})`)

  let allOk = true
  for (const kind of ['docx', 'pdf'] as ExportKind[]) {
    const spec: ArtifactSpec = { scope: versionScope(officialId), kind }
    const generated = await generateForVersion(payload, officialId)
    const docs = await produceArtifacts(spec, generated, prefix, docxToPdf)
    const ready = await isExportReady(spec)
    const zip = await loadCachedExportZip(spec)
    const ok = ready && zip != null && zip.length > 0
    allOk = allOk && ok
    console.log(
      `  ${kind.toUpperCase()}: ${docs.length} deliverable(s) → ready=${ready}, zip=${zip ? `${zip.length} bytes` : 'null'} ${ok ? '✓' : '✗'}`,
    )
  }

  console.log(`\n${'='.repeat(50)}`)
  if (!allOk) {
    console.error('✗ STAGE-2 EXPORT VERIFY FAILED')
    process.exit(1)
  }
  console.log('✓ STAGE-2 EXPORT VERIFY PASSED (version → produce → cache → zip, DOCX + PDF)')
}

await run().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
process.exit(0)
