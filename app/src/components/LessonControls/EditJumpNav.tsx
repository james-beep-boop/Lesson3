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
import React, { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAllFormFields } from '@payloadcms/ui'

interface LessonEntry {
  index: number
  number: number
  title: string
}

export default function EditJumpNav() {
  const [fields] = useAllFormFields()
  const searchParams = useSearchParams()
  const didDeepLink = useRef(false)
  // The single in-flight scroll-settle timeout; a new scroll (or unmount) cancels it so competing
  // chains can't fight over the viewport (a rerender or a second nav click starting a fresh jump).
  const scrollTimer = useRef<number | null>(null)

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
  // Read the latest lessons inside the deep-link effect without making it a dependency (it would
  // re-run every render, since `lessons` is rebuilt each time). Kept current via an effect — a
  // ref must not be mutated during render.
  const lessonsRef = useRef(lessons)
  useEffect(() => {
    lessonsRef.current = lessons
  })

  /**
   * Scroll a field into view, expanding a collapsed lesson row first. `scrollIntoView` +
   * `scroll-margin-top` (custom.scss, clears the floating toolbar) does the positioning.
   *
   * The wrinkle: this form is huge and Payload LAZY-RENDERS field content as it nears the viewport,
   * so its height grows for seconds after load, and a target can reach the top early then DRIFT
   * down as the rows above it finish laying out. So we re-pin on a short interval, stopping only
   * once the document height has settled (rendering done) AND the target sits at the top — held in
   * `scrollTimer` so a new jump cancels this one. On a click (form rendered) it settles at once; on
   * a deep-link load, once rendering finishes. Instant, not smooth: a 90 000px smooth animation
   * would be disorienting and would fight the re-pinning. `block: 'start'` targets the row header,
   * which doesn't move when the row expands.
   */
  const scrollToField = useCallback((id: string) => {
    if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = null
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
      // 12s hard cap covers a target legitimately too near the document end to reach the top.
      scrollTimer.current =
        !(stableHeight >= 4 && landed) && tries++ < 80 ? window.setTimeout(settle, 150) : null
    }
    settle()
  }, [])

  // Cancel any in-flight scroll chain when the editor unmounts.
  useEffect(
    () => () => {
      if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current)
    },
    [],
  )

  // Deep link (?lesson=<n>): scroll to that lesson once the (heavy) form has rendered its row.
  useEffect(() => {
    if (didDeepLink.current) return
    const n = Number(searchParams.get('lesson'))
    if (!Number.isInteger(n) || n <= 0) return
    let cancelled = false
    let pollTimer: number | null = null
    let tries = 0
    const tick = () => {
      if (cancelled) return
      const entry = lessonsRef.current.find((l) => l.number === n)
      const targetId = `lessons-row-${entry ? entry.index : n - 1}`
      if (document.getElementById(targetId)) {
        didDeepLink.current = true
        scrollToField(targetId)
      } else if (tries++ < 40) {
        pollTimer = window.setTimeout(tick, 100)
      }
    }
    tick()
    return () => {
      cancelled = true
      if (pollTimer != null) window.clearTimeout(pollTimer)
    }
  }, [searchParams, scrollToField])

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
