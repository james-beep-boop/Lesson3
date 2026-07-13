'use client'

/**
 * In-form jump navigation for the version editor (2026-07-13) — the edit-page counterpart to the
 * lesson page's sticky `.doc-nav`. The version editor is a long Payload form (8+ collapsible lesson
 * rows, then Final Explanation and Summary Table groups); this floats a row of chips —
 *   Top · [Lessons] 1 2 3 … · Final explanation · Summary table
 * that scroll the matching field into view.
 *
 * It renders INSIDE {@link LessonControls}, which Payload injects into `.doc-controls` — already
 * `position: sticky; top: 0` (verified against installed @payloadcms/next) — so the nav floats with
 * the toolbar for free, mirroring the view page's behaviour with no extra sticky wrapper.
 *
 * TARGETS are Payload's own stable DOM ids (verified payload@3.85.1): each lesson array row is
 * `#lessons-row-<index>` and the two groups are `#field-finalExplanation` / `#field-summaryTable`.
 * The lesson list itself comes from FORM STATE (reactive to add/remove, and the source of each
 * lesson's number + title), not the DOM.
 *
 * DEEP LINK: the lesson page's Edit button forwards the lesson the reader was on as `?lesson=<n>`
 * (its jump nav sets `#lesson-<n>`); on mount we scroll straight to that lesson so editing opens
 * where viewing left off.
 */
import React, { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAllFormFields } from '@payloadcms/ui'

interface LessonEntry {
  index: number
  number: number
  title: string
}

/**
 * Scroll a field into view, expanding a collapsed lesson row first. `scrollIntoView` +
 * `scroll-margin-top` (set in custom.scss to clear the floating toolbar) does the positioning.
 *
 * The wrinkle: this form is huge and Payload LAZY-RENDERS field content as it nears the viewport,
 * so its total height grows for seconds after load, and a target can even reach the top early and
 * then DRIFT down as the rows above it finish laying out. So we re-pin the target on a short
 * interval and stop only once the document height has settled (rendering done) AND the target is
 * actually at the top. On a click (form already rendered) that condition holds almost immediately;
 * on a fresh deep-link load it holds once the form finishes rendering. Instant, not smooth: a
 * 90 000px smooth animation would be disorienting, and smooth fights the re-pinning.
 * `block: 'start'` targets the row header, which doesn't move when the row expands.
 */
function scrollToField(id: string): void {
  const el = document.getElementById(id)
  if (!el) return
  const collapsed = el.querySelector('.collapsible--collapsed .collapsible__toggle')
  if (collapsed instanceof HTMLElement) collapsed.click()
  let prevHeight = -1
  let stableHeight = 0
  let tries = 0
  const settle = () => {
    el.scrollIntoView({ block: 'start' })
    const height = document.documentElement.scrollHeight
    stableHeight = height === prevHeight ? stableHeight + 1 : 0
    prevHeight = height
    const landed = Math.round(el.getBoundingClientRect().top) < 200
    // Stop only when the form has stopped growing AND the target sits at the top; else keep pinning
    // (12s hard cap covers a target legitimately too near the document end to reach the top).
    if (!(stableHeight >= 4 && landed) && tries++ < 80) window.setTimeout(settle, 150)
  }
  settle()
}

export default function EditJumpNav() {
  const [fields] = useAllFormFields()
  const searchParams = useSearchParams()
  const didDeepLink = useRef(false)

  // Lesson entries from form state: every top-level `lessons.<i>.*` path contributes index i;
  // number + title come from that row (falling back to position when the number isn't loaded).
  const indices = new Set<number>()
  for (const key of Object.keys(fields)) {
    const m = /^lessons\.(\d+)\./.exec(key)
    if (m) indices.add(Number(m[1]))
  }
  const lessons: LessonEntry[] = [...indices]
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      number: Number(fields[`lessons.${index}.number`]?.value) || index + 1,
      title: String(fields[`lessons.${index}.title`]?.value ?? ''),
    }))

  // Deep link (?lesson=<n>): scroll to that lesson once the (heavy) form has rendered its row.
  useEffect(() => {
    if (didDeepLink.current) return
    const n = Number(searchParams.get('lesson'))
    if (!Number.isInteger(n) || n <= 0) return
    const entry = lessons.find((l) => l.number === n)
    const targetId = `lessons-row-${entry ? entry.index : n - 1}`
    let tries = 0
    const tick = () => {
      if (document.getElementById(targetId)) {
        didDeepLink.current = true
        scrollToField(targetId)
      } else if (tries++ < 40) {
        window.setTimeout(tick, 100)
      }
    }
    tick()
  }, [searchParams, lessons])

  if (lessons.length === 0) return null

  return (
    <nav className="lesson-controls__nav" aria-label="Jump to section">
      <button type="button" className="lesson-controls__nav-link" onClick={() => scrollToField('field-title')}>
        Top
      </button>
      <span className="lesson-controls__nav-label">Lessons</span>
      {lessons.map((l) => {
        const label = l.title ? `Lesson ${l.number}: ${l.title}` : `Lesson ${l.number}`
        return (
          <button
            key={l.index}
            type="button"
            className="lesson-controls__nav-chip"
            title={label}
            aria-label={label}
            onClick={() => scrollToField(`lessons-row-${l.index}`)}
          >
            {l.number}
          </button>
        )
      })}
      <button
        type="button"
        className="lesson-controls__nav-link"
        onClick={() => scrollToField('field-finalExplanation')}
      >
        Final explanation
      </button>
      <button
        type="button"
        className="lesson-controls__nav-link"
        onClick={() => scrollToField('field-summaryTable')}
      >
        Summary table
      </button>
    </nav>
  )
}
