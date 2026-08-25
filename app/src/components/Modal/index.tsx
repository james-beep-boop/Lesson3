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
import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  /** Called on Escape or backdrop click. The caller decides whether to actually close (e.g. ignore
   *  while a request is in flight). */
  onClose: () => void
  /** Optional modifier appended to `.modal`, for callers needing a different size/shape (e.g.
   *  `modal--versions`, a wider panel for the version list). Purely presentational — the dialog
   *  semantics and focus behaviour above are identical for every caller.
   *
   *  Both surfaces now define the base `.modal-backdrop`/`.modal` chrome — the frontend in
   *  `styles.css`, the admin in `custom.scss` (lifted there on 2026-08-04, when the delete-plans
   *  confirmation became its second Modal) — so every caller is a true modifier and none has to
   *  restate the backdrop. */
  className?: string
  children: React.ReactNode
}

/**
 * ⚑ PORTALLED TO `document.body`, NOT RENDERED IN PLACE (2026-08-23).
 *
 * `.modal-backdrop` is `position: fixed; inset: 0`, which means "the viewport" ONLY while no
 * ancestor establishes a containing block. Payload's own document-controls wrapper sets
 * `transform: translateZ(0)` inside `@media (max-width: 1024px)`, and an identity transform is
 * enough: every dialog opened from the version editor's control bar was then laid out inside that
 * ~235px-tall strip. Measured at a 1227px-tall viewport — the page behind was not dimmed, the panel
 * was centred in the strip rather than the window (so it overlapped the site header), and
 * backdrop-click-to-close only worked inside the strip. Editing help, Insert link, the too-narrow
 * notice and the recovery restore prompt were all affected; above 1024px none of them were, which is
 * why it survived so long.
 *
 * Portalling is the STRUCTURAL fix rather than hunting the transform: `document.body` has no
 * transformed ancestor by construction, so no future `transform`, `filter`, `contain` or
 * `will-change` anywhere in the tree can re-break it.
 *
 * The panel is a separate component so its focus/Escape/scroll-lock effects mount only once the
 * portal target exists. Gating those effects inside one component would run them on the first
 * (target-less) render, when `panelRef` is still null — focus would never enter the dialog and the
 * key handler would attach against nothing.
 */
/** Never subscribes — the store is constant. It exists only to give the server and the client
 *  different snapshots, which is what makes "have we hydrated?" a render-safe question. */
const NEVER_CHANGES = () => () => {}

export default function Modal(props: ModalProps) {
  // `document` does not exist while rendering on the server, so the portal has to wait for the
  // client. `useSyncExternalStore` with a constant store is the render-safe way to ask: `false` on
  // the server, `true` after hydration, with no `setState` in an effect (which the lint forbids) and
  // no reading of `document` during render (which would be a hydration mismatch the day a caller
  // renders a Modal on first paint).
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  )
  if (!hydrated) return null
  return createPortal(<ModalPanel {...props} />, document.body)
}

function ModalPanel({ title, onClose, className, children }: ModalProps) {
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
        // ⚑ `lp-modal` is EMITTED BY THE COMPONENT, and that is the whole mechanism: the admin
        // stylesheet scopes the app's button system on it (`.lp-modal .btn`), so every button in
        // every dialog is styled BY CONSTRUCTION rather than by each call site remembering
        // `className="lp-btn"`.
        //
        // It exists because #289 portalled this panel to `document.body`, which moved dialog buttons
        // out of `.collection-edit--lesson-bundle-versions .lesson-controls-wrap` — the container
        // scope that had been styling them for free. Nothing errored and no test failed; buttons just
        // silently fell back to Payload's treatment, and `Discard the changes` rendered as
        // transparent-on-transparent with black ink. Twice in two weeks a dialog shipped without the
        // opt-in class and review did not catch it, which is what moved this from "remember the
        // class" to "the component guarantees the ancestry".
        //
        // House-prefixed rather than reusing the bare `.modal` below, so the scope cannot collide
        // with a `.modal` on any Payload-owned dialog. Specificity is 0-2-0 — deliberately identical
        // to `.btn.lp-btn`, so the `&.btn--style-*` restatements nested in that block still outrank
        // it at 0-3-0 and the #169 trap stays closed. `custom.scss` carries the contract.
        className={className ? `modal lp-modal ${className}` : 'modal lp-modal'}
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
        {/* The caller's content, padded. Separate from the panel so `.modal__title` can be a
            full-bleed header bar (the Manage panel's chrome) rather than a heading with margin. */}
        <div className="modal__content">{children}</div>
      </div>
    </div>
  )
}
