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
 *
 * ACTIVE SECTION (2026-07-25): the chip for wherever you are is filled in (blue/white, `aria-current`)
 * so a long plan says which lesson you're on — the top user request. Keyboard focus wins while typing;
 * scroll position is the reading fallback. The rule itself lives in {@link ./currentSection} so it can
 * be unit-tested away from the DOM. Note this is a DESKTOP affordance: below 640px `.doc-controls` is
 * deliberately NOT sticky (custom.scss, #99 item ①), so the bar — and this nav with it — scrolls away.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAllFormFields } from '@payloadcms/ui'

import {
  crossingLine,
  FINAL_EXPLANATION_ID,
  lessonRowId,
  ownCollapsedToggle,
  pickCurrentSection,
  sectionKeyForFocus,
  SUMMARY_TABLE_ID,
  type SectionPosition,
} from './currentSection'

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
  // Active-section tracking. Two independent signals, resolved focus-first (see `activeKey`).
  // `positionKey` is "where the page is" — the tracking effect writes it, and a chip click anticipates it.
  const navRef = useRef<HTMLElement | null>(null)
  const [positionKey, setPositionKey] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

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
   * Scroll a field into view, expanding the target's own disclosure — a lesson row, or either
   * trailing panel — on the way in. `scrollIntoView` +
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
    let prevHeight = -1
    let stableHeight = 0
    let tries = 0
    /**
     * ⚑ RETRIED EACH CYCLE, NOT ONCE BEFORE THE SCROLL, and the difference is the whole fix. The two
     * trailing panels are groups, so their contents come from a nested `RenderIfInViewport`
     * (rootMargin 1000px, no `forceRender` from `Group`): a target far enough below the viewport has
     * no `.collapsible-field` in the DOM yet, the toggle resolves to `null`, and a single attempt
     * before scrolling silently does nothing. Reproduced in a browser on Summary table — the jump
     * landed, Payload mounted the disclosure afterwards, and it stayed shut. Lesson rows never showed
     * this: their wrapper and Collapsible render with the array.
     *
     * ⚑ AND IT LATCHES ON THE FIRST SUCCESS. `ownCollapsedToggle` is self-limiting — an open panel
     * has no `--collapsed` — but the settle chain runs up to 12s, so without the latch a reader who
     * collapsed the panel again while it was still re-pinning would have it yanked back open.
     */
    let opened = false
    const openTarget = () => {
      if (opened) return
      const toggle = ownCollapsedToggle(el)
      if (!toggle) return
      toggle.click()
      opened = true
    }
    const settle = () => {
      // Before the scroll, exactly as the single pre-loop attempt used to be — `settle` runs
      // synchronously below, so the first cycle still opens an already-rendered target immediately.
      openTarget()
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

  /**
   * Back to the top of the form — NOT a field jump, and that distinction is the fix.
   *
   * ⚑ THE REGRESSION THIS REPAIRS (reported 2026-08-25). This was `jumpTo('field-title')`, which
   * worked only while `title` was a top-level field. #297 moved it into the collapsed "Plan and
   * sub-strand details" panel, and both roles then lost it: for a teacher the panel's `condition` is
   * false so `#field-title` is never rendered at all, and for an administrator it sits inside a
   * collapsed container. `scrollToField` returns silently on a missing element — no error, no console
   * warning, the button simply stopped doing anything.
   *
   * ⚑ So "Top" must not depend on any FIELD existing. It means the top of the page, and now says so.
   * A chip that points at a field is allowed to break when that field moves; this one is not.
   *
   * It also cancels an in-flight jump, which the old spelling got for free from `scrollToField`:
   * that re-pinning loop runs for up to 12 seconds, and without the cancel it would drag the page
   * back to whichever chip was clicked before this one.
   *
   * `behavior: 'instant'` for the same reason the field jumps are instant — a 90 000px smooth
   * animation is disorienting. Explicit rather than relying on the admin route group not inheriting
   * the frontend's `scroll-behavior: smooth`.
   */
  const jumpToTop = useCallback(() => {
    if (scrollTimer.current != null) window.clearTimeout(scrollTimer.current)
    scrollTimer.current = null
    setFocusKey(null)
    // Nothing is "current" above the first lesson, so clear rather than write an untracked key.
    setPositionKey(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  /**
   * Jump AND highlight at once. Clearing `focusKey` matters: if you were typing in lesson 1 and then
   * click chip 5, the stale focus would otherwise keep lesson 1 lit. The tracking effect re-derives
   * the highlight as the scroll settles, so this is an optimistic head start, not a separate source
   * of truth. ('field-title' is not a tracked section, so "Top" correctly lights nothing.)
   */
  const jumpTo = useCallback(
    (id: string) => {
      setFocusKey(null)
      setPositionKey(id)
      scrollToField(id)
    },
    [scrollToField],
  )

  // Section ids in document order, as ONE STRING. The joined value — not an array identity, which
  // would be fresh every render like `lessons` — is what the tracking effect depends on; it splits the
  // string apart again below. That indirection is also what keeps the ~2,000-key `fields` object out of
  // the tracking effect's retained scope. Derived from lesson INDICES only, so typing never changes it: the
  // effect rebuilds roughly twice per page load, not per keystroke.
  const sectionIdsKey = [
    ...lessons.map((l) => lessonRowId(l.index)),
    FINAL_EXPLANATION_ID,
    SUMMARY_TABLE_ID,
  ].join('|')

  // Track the section under the toolbar, from TWO signals:
  //   • scroll — the position changed;
  //   • a body ResizeObserver — the position changed WITHOUT scrolling, because Payload lazy-renders
  //     this form and the document grows for seconds after load (the same behaviour `scrollToField`
  //     re-pins against above). A scroll listener alone would silently go stale through that.
  //
  // An IntersectionObserver is deliberately NOT used, despite looking like the natural fit. It fires
  // when an element ENTERS or LEAVES the root band — but this rule turns on a section's TOP crossing
  // the toolbar line, and a row taller than the band stays continuously intersecting while its top
  // crosses. So the callback never fires at the moment the answer changes, and with Payload's
  // inter-row gaps the chip can stick on the previous lesson for the whole height of an expanded one.
  // (Found in review, 2026-07-25 — the first implementation had exactly this defect.)
  useEffect(() => {
    // Always ≥2 ids: the two trailing groups are unconditional.
    const ids = sectionIdsKey.split('|')

    // MEASURE both bounds; {@link crossingLine} decides between them (and documents why it is `max`).
    // Never hardcoded: the bar's height changes as it wraps, and on a phone it isn't sticky at all,
    // so the line correctly collapses towards the viewport top. `scroll-margin-top` is read back off
    // a real section rather than restated as `7rem` here — that SCSS/TS hand-sync is precisely what
    // drifted 6px and made every chip jump light its neighbour (DECISIONS 2026-07-28).
    //
    // `probe` is whichever tracked section the caller already found in the DOM, so this adds no
    // lookup of its own; all of them carry the same margin (custom.scss sets it on one selector list).
    const measureThreshold = (probe: HTMLElement | null): number => {
      const bar = navRef.current?.closest('.doc-controls')
      const barBottom =
        bar instanceof HTMLElement ? Math.max(0, bar.getBoundingClientRect().bottom) : 0
      return crossingLine(
        barBottom,
        probe ? Number.parseFloat(getComputedStyle(probe).scrollMarginTop) : NaN,
      )
    }

    // Read-only pass (~15 rect reads, no interleaved writes, so no layout thrash) — cheap enough to
    // redo wholesale. Re-measuring beats caching: a cached map would go stale exactly when the body
    // grows, which is the case this exists to handle.
    const recompute = () => {
      const positions: SectionPosition[] = []
      // The first section actually in the DOM doubles as the `scroll-margin-top` probe, so measuring
      // the landing line costs no extra lookup — and needs no assumption about which id leads `ids`.
      let probe: HTMLElement | null = null
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        probe ??= el
        positions.push({ key: id, top: el.getBoundingClientRect().top })
      }
      setPositionKey(pickCurrentSection(positions, measureThreshold(probe)))
    }

    // One measurement per frame, however many events land in it — scroll fires far more often than a
    // layout can change, and a scroll + a resize in the same frame should cost one pass, not two.
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        recompute()
      })
    }

    recompute()
    // `capture: true` because scroll does not bubble — this still catches it if the form ever scrolls
    // in a container rather than the window. `passive` so it can never delay scrolling.
    document.addEventListener('scroll', schedule, { passive: true, capture: true })
    const resize = new ResizeObserver(schedule)
    resize.observe(document.body)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener('scroll', schedule, { capture: true })
      resize.disconnect()
    }
  }, [sectionIdsKey])

  // Focus beats scroll while editing: the field you're typing in is a truer answer to "which lesson am
  // I working on" than whatever sits under the toolbar. `focusin` on a toolbar button resolves to null,
  // which hands control back to scroll position; the `focusout` arm covers focus dropping to nowhere.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setFocusKey(sectionKeyForFocus(e.target as Element | null))
    const onFocusOut = (e: FocusEvent) => {
      if (e.relatedTarget === null) setFocusKey(null)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

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

  const activeKey = focusKey ?? positionKey
  /**
   * Props for one tracked-section button. `aria-current="location"` is the token for position within a
   * set of in-page navigation links (`page` would claim this is a different document), and it is the
   * SINGLE encoding of active-ness: omitted entirely when inactive, so `custom.scss` can style the
   * active chip off `[aria-current]` directly rather than a parallel modifier class the two could
   * drift apart on. (`aria-current="false"` would still match a presence selector — hence omitted.)
   */
  const sectionProps = (id: string) => ({
    ...(activeKey === id ? ({ 'aria-current': 'location' } as const) : null),
    onClick: () => jumpTo(id),
  })

  return (
    <nav className="lesson-controls__nav" aria-label="Jump to section" ref={navRef}>
      {/* "Top" deliberately does NOT take `sectionProps`: nothing should be current when you are above
          the first lesson, and `jumpToTop` clears `positionKey` to say so. See its ⚑ for why this is
          a page scroll rather than a jump to `field-title`. */}
      <button type="button" className="lesson-controls__nav-link" onClick={jumpToTop}>
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
            {...sectionProps(lessonRowId(l.index))}
          >
            {l.number}
          </button>
        )
      })}
      <button
        type="button"
        className="lesson-controls__nav-link"
        {...sectionProps(FINAL_EXPLANATION_ID)}
      >
        Final explanation
      </button>
      <button
        type="button"
        className="lesson-controls__nav-link"
        {...sectionProps(SUMMARY_TABLE_ID)}
      >
        Summary table
      </button>
    </nav>
  )
}
