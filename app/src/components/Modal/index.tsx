'use client'

/**
 * A small accessible modal dialog for The App — a backdrop + centered panel used in place of the
 * browser's native prompt()/confirm() for anything more than a bare yes/no. Handles the dialog
 * basics: `role="dialog"` + `aria-modal`, a title wired via `aria-labelledby`, Escape and
 * backdrop-click to close (both routed through `onClose`, so a caller can veto while busy), and
 * focus moved into the panel on open + restored to the trigger on close. Body scroll is locked
 * while open. Keep the contents (fields, buttons) in the caller.
 */
import React, { useEffect, useId, useRef } from 'react'

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  /** Called on Escape or backdrop click. The caller decides whether to actually close (e.g. ignore
   *  while a request is in flight). */
  onClose: () => void
  children: React.ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Move focus into the panel (first focusable, else the panel itself).
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    )
    ;(focusable ?? panelRef.current)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="modal"
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
