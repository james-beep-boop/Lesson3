import React from 'react'
import Link from 'next/link'

import { requirePublicLibrary } from '@/lib/publicLibrary'

export const metadata = { title: 'Free CBE lesson plans — ARES' }

/**
 * `/explore` — the public lesson library's entry page (`docs/DESIGN-public-library.md`).
 *
 * ⚑ **THIS IS A PLACEHOLDER.** The boundary is real and enforced; the CONTENT is not built yet.
 * The browse list, search, subject/grade filters, lesson pages, generator-derived preview and
 * social/OG metadata all arrive with the public read slice. Nothing here reads lesson data, so no
 * corpus is exposed by this route today.
 *
 * ⚑ **`requirePublicLibrary()` BELOW IS THE ACCESS BOUNDARY, not the missing link on `/login`.** An
 * offline school installation must serve no public surface at all, and an operator who has not opted
 * in must not be publishing lesson plans because someone guessed a URL. Every public route added
 * later — the lesson pages, the metadata endpoints and the artifact handler especially — calls the
 * same guard. It is a shared function rather than an inlined `if` precisely so the third and fourth
 * copies cannot quietly go missing; see its docblock in `lib/publicLibrary.ts` for why a layout
 * cannot carry this boundary.
 *
 * Mobile-first when it is built: 360–390 px phones are the primary constraint, not an afterthought
 * on a laptop design.
 */
export default async function ExplorePage() {
  requirePublicLibrary()

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
