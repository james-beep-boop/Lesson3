import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { isPublicLibraryEnabled } from '@/lib/publicLibrary'

export const metadata = { title: 'Free CBE lesson plans — ARES' }

/**
 * `/explore` — the public lesson library's entry page (`docs/DESIGN-public-library.md`).
 *
 * ⚑ **THIS IS A PLACEHOLDER.** The boundary is real and enforced; the CONTENT is not built yet.
 * The browse list, search, subject/grade filters, lesson pages, generator-derived preview and
 * social/OG metadata all arrive with the public read slice. Nothing here reads lesson data, so no
 * corpus is exposed by this route today.
 *
 * ⚑ **THE `notFound()` BELOW IS THE ACCESS BOUNDARY, not the missing link on `/login`.** An offline
 * school installation must serve no public surface at all, and an operator who has not opted in must
 * not be publishing lesson plans because someone guessed a URL. Every public route added later — the
 * lesson pages, the metadata endpoints and the artifact handler especially — repeats this check
 * server-side. Do not factor it into a layout and assume child routes inherit it: a route group's
 * layout does not run for every rendering path, and the failure mode of getting that wrong is a
 * silently public corpus.
 *
 * Mobile-first when it is built: 360–390 px phones are the primary constraint, not an afterthought
 * on a laptop design.
 */
export default async function ExplorePage() {
  if (!isPublicLibraryEnabled()) notFound()

  return (
    <section className="explore">
      <h1>Free CBE lesson plans</h1>
      <p>
        A public library of ARES competency-based lesson plans for Kenyan classrooms. Browsing and
        search are on their way.
      </p>
      <p>
        <Link href="/login">Sign in</Link>
      </p>
    </section>
  )
}
