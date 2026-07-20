'use client'

/**
 * A small accessible modal dialog for The App — a backdrop + centered panel used in place of the
 * browser's native prompt()/confirm() for anything more than a bare yes/no. Handles the dialog
 * basics: `role="dialog"` + `aria-modal` (the ARIA signal that the background is inert to assistive
 * tech), a title wired via `aria-labelledby`, Escape and backdrop-click to close (both routed
 * through `onClose`, so a caller can veto while busy), focus moved into the panel on open + restored
 * to the trigger on close, and a Tab FOCUS TRAP so keyboard focus cycles within the panel instead
 * of escaping to the controls behind it (GPT review 2026-07-17). Body scroll is locked while open.
 * Keep the contents (fields, buttons) in the caller.
 */
import React, { useEffect, useId, useRef } from 'react'

export default function Modal({
  title,
  onClose,
  className,
  children,
}: {
  title: string
  /** Called on Escape or backdrop click. The caller decides whether to actually close (e.g. ignore
   *  while a request is in flight). */
  onClose: () => void
  /** Optional modifier appended to `.modal`, for callers needing a different size/shape (e.g.
   *  `modal--versions`, a wider panel for the version list). Purely presentational — the dialog
   *  semantics and focus behaviour above are identical for every caller. */
  className?: string
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  // Callers pass inline `onClose` handlers whose identity changes every render (e.g. the email
  // modal re-renders per keystroke). Route the effect through a ref so the mount effect below runs
  // ONCE per open — otherwise its cleanup/setup would rerun on each keystroke, bouncing focus
  // (input → trigger → input), re-capturing `previouslyFocused`, and churning the listener +
  // body-overflow lock.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Move focus into the panel (first focusable, else the panel itself).
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? panelRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      // Focus trap: keep Tab / Shift+Tab cycling inside the panel. Recomputed per keystroke because
      // the panel's focusable set changes (fields disable while sending, error rows appear). Skips
      // disabled/hidden nodes so focus never lands on an untabbable control.
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null)
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      const outside = !panel.contains(active)
      if (e.shiftKey && (active === first || outside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || outside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        // Clicks inside the panel must not bubble to the backdrop's close handler.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
