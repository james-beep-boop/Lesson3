import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'

export default async function BrowsePage() {
  const { payload, user } = await requireUser()

  // Access-gated: a Teacher sees only published bundles; Editors/Subject Admins additionally
  // see their in-scope drafts. The explicit published filter keeps the default view clean.
  // `select` keeps the list query light — only the fields the list renders, not the whole
  // (large) lesson body; depth 2 resolves the subjectGrade → subject name for the label.
  const { docs } = await payload.find({
    collection: 'lesson-bundles',
    where: { _status: { equals: 'published' } },
    overrideAccess: false,
    user,
    depth: 2,
    limit: 200,
    sort: 'title',
    select: { title: true, subjectGrade: true },
  })

  return (
    <section className="browse">
      <h1>Lesson plans</h1>
      {docs.length === 0 ? (
        <p className="muted">No published lesson plans yet.</p>
      ) : (
        <ul className="bundle-list">
          {docs.map((b) => {
            // depth 2 populates these relationships, so `typeof === 'object'` narrows the
            // `id | doc` unions without casts.
            const sg = typeof b.subjectGrade === 'object' ? b.subjectGrade : null
            const subject = sg && typeof sg.subject === 'object' ? sg.subject : null
            const meta = sg && subject ? `${subject.name} · Grade ${sg.grade}` : undefined
            return (
              <li key={b.id} className="bundle-row">
                <Link href={`/lessons/${b.id}`} className="bundle-title">
                  {b.title}
                </Link>
                {meta && <span className="bundle-meta">{meta}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
