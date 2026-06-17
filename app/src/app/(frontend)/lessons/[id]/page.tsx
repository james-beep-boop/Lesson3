import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireUser } from '@/lib/session'
import { findReadableBundle } from '@/lib/readBundle'
import { generateForBundle, NotExportableError } from '@/generator/generateForBundle'
import { docxToSections, type PreviewSection } from '@/generator/previewBundle'

export default async function LessonView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, user } = await requireUser()

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
  // absent for some sub-strands). Compact layout on-screen: the Resource column is deferred/blank,
  // so Standard would just show an empty column. Both formats remain available to download below.
  let sections: PreviewSection[] = []
  let viewError: string | null = null
  try {
    sections = await docxToSections(await generateForBundle(payload, id, 'compact'))
  } catch (e) {
    viewError =
      e instanceof NotExportableError
        ? 'This lesson is not published yet, so it can’t be viewed here.'
        : 'Could not render this lesson.'
  }

  return (
    <article className="lesson">
      <Link href="/" className="back-link">
        ← All lesson plans
      </Link>
      <h1>{bundle.title}</h1>

      <div className="export-bar">
        <span className="export-label">Download</span>
        {(['standard', 'compact'] as const).map((format) => (
          <a key={format} className="btn" href={`/api/lesson-bundles/${id}/export?format=${format}`}>
            {format === 'standard' ? 'Standard' : 'Compact'} (.zip)
          </a>
        ))}
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
