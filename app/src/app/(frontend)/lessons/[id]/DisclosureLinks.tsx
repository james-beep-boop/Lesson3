'use client'

import { useEffect } from 'react'

/**
 * The lesson page's collapsed blocks are native `<details>`; this is the only script they need
 * (interface refinement 2026-11-10, step 5).
 *
 * 1. A link to a block opens it: an inbound `#lesson-7` on load, a hash change, and a click on any
 *    in-page link (the sticky jump nav), including one to the hash already in the address bar, which
 *    fires no hashchange. The block is opened FIRST and then scrolled to, so it lands below the
 *    sticky toolbar (`scroll-margin-top` on `.doc-disclosure`) instead of as a closed heading.
 * 2. Opening a lesson by its title records `#lesson-n` with `replaceState`: no scroll jump and no new
 *    history entry. `EditActions` reads that hash, so Edit still lands on the lesson being read,
 *    which only the jump nav used to set.
 */
export default function DisclosureLinks() {
  useEffect(() => {
    const openTarget = (hash: string, scroll: boolean) => {
      const id = decodeURIComponent(hash.replace(/^#/, ''))
      if (!id) return
      const el = document.getElementById(id)
      if (!(el instanceof HTMLDetailsElement) || !el.classList.contains('doc-disclosure')) return
      el.open = true
      if (scroll) el.scrollIntoView({ block: 'start' })
    }

    openTarget(window.location.hash, true)

    const onHashChange = () => openTarget(window.location.hash, true)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]')
      if (a) openTarget(a.getAttribute('href') ?? '', false) // the browser's own jump follows
    }
    const onToggle = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLDetailsElement) || !el.open) return
      const n = el.dataset.lesson
      if (n && window.location.hash !== `#lesson-${n}`)
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}#lesson-${n}`,
        )
    }

    window.addEventListener('hashchange', onHashChange)
    document.addEventListener('click', onClick)
    // `toggle` does not bubble; a capturing listener still sees it on every block.
    document.addEventListener('toggle', onToggle, true)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      document.removeEventListener('click', onClick)
      document.removeEventListener('toggle', onToggle, true)
    }
  }, [])
  return null
}
