import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { findReadableBundle } from '@/lib/readBundle'
import { generateForBundle, NotExportableError } from '@/generator/generateForBundle'
import { docxToSections, type PreviewSection } from '@/generator/previewBundle'
import type { LessonSequenceFormat } from '@/generator'
import DownloadButtons from './DownloadButtons'

export default async function LessonView({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ format?: string }>
}) {
  const { id } = await params
  const { payload, user } = await requireUser()

  // On-screen view defaults to Compact (Standard's Resource column is deferred/blank — see
  // DECISIONS 2026-06-16); the toggle below lets a teacher switch to Standard on demand.
  const format: LessonSequenceFormat =
    (await searchParams).format === 'standard' ? 'standard' : 'compact'

  // Access-gated read — published-only for Teachers; not-visible → 404. A real DB/runtime error
  // propagates (not masked as 404). Only the title is read here, so depth 0 is enough.
  const bundle = await findReadableBundle(payload, { id, user })
  if (!bundle) notFound()

  // Faithful content view: render the REAL generated DOCX to HTML (SPEC §5 content-preview tier —
  // content + table structure are faithful; styling/colour are intentionally dropped). This is
  // derived from the generator, never a parallel renderer. The exact PDF view comes later (§9).
  // mammoth escapes DOCX text into HTML text nodes, and our prose is plain strings (no inline
  // markup), so the rendered HTML carries no executable markup.
  //
  // A bundle is three documents (SPEC §3); render each present one (FE/ST may legitimately be
  // absent for some sub-strands). Both formats remain available to download below.
  let sections: PreviewSection[] = []
  let viewError: string | null = null
  try {
    sections = await docxToSections(await generateForBundle(payload, id, format))
  } catch (e) {
    if (e instanceof NotExportableError) {
      // Expected for an unpublished bundle — not an error worth logging.
      viewError = 'This lesson is not published yet, so it can’t be viewed here.'
    } else {
      // A real generator/converter failure — log with context so it's triageable in prod.
      payload.logger.error({ err: e, bundleId: id, userId: user?.id }, 'teacher lesson render failed')
      viewError = 'Could not render this lesson.'
    }
  }

  return (
    <article className="lesson">
      <Link href="/" className="back-link">
        ← All lesson plans
      </Link>
      <h1>{bundle.title}</h1>

      <div className="export-bar">
        <span className="export-label">View</span>
        {(['compact', 'standard'] as const).map((f) => (
          <Link
            key={f}
            className="btn"
            href={`/lessons/${id}?format=${f}`}
            aria-current={format === f ? 'page' : undefined}
            style={format === f ? { fontWeight: 600, textDecoration: 'underline' } : undefined}
          >
            {f === 'standard' ? 'Standard' : 'Compact'}
          </Link>
        ))}
      </div>

      <div className="export-bar">
        <span className="export-label">Download</span>
        <DownloadButtons id={id} />
      </div>

      {viewError ? (
        <p className="muted">{viewError}</p>
      ) : (
        sections.map((s) => (
          <section key={s.label} className="doc-section">
            <h2 className="doc-section-title">{s.label}</h2>
            <div className="doc-preview" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))
      )}
    </article>
  )
}
