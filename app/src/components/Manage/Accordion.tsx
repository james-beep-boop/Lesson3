'use client'

/**
 * Manage accordion — the disclosure shell (D7/D7a).
 *
 * A disclosure LIST, not a strict accordion: several panels may be open at once, because an
 * administrator comparing two of them should not have one snap shut. Semantics follow the APG
 * disclosure pattern already used in `UserMenu` — `<h2><button aria-expanded aria-controls>` — so a
 * screen reader announces a heading whose control states whether its region is showing.
 *
 * ⚑ CLOSING A PANEL DOES NOT UNMOUNT IT. Today's panels hold consequential local state that a stray
 * click on a heading would otherwise destroy: `DeletePlansPanel`'s selected rows AND active search (a
 * multi-select assembled across a curriculum tree), `UploadBundles`'s chosen files including the
 * native input's value, and the editors widget's pending picker selections. `{open && <Panel/>}` is
 * the shorter thing to write and it silently throws that work away, which is why D7a specifies the
 * lifecycle rather than leaving it to whoever typed first.
 *
 * ⚑ AND THE `hidden` ATTRIBUTE IS NOT SELF-ENFORCING. Measured on this page (2026-08-17): a bare
 * `<div hidden>` inside `.lp-admin-dash` computes `display: none` with zero client rects — Payload's
 * cascade does not interfere — but the SAME element carrying any class with a `display` value
 * (`flex` or `block`) renders in full, 1 rect and ~25px tall, while still claiming to be closed. No
 * `[hidden]` guard rule existed anywhere in the loaded stylesheets. The guard in `custom.scss` is
 * therefore load-bearing, not belt-and-braces: without it the first panel that needs a layout
 * container leaks its contents onto a page that says it is collapsed.
 */
import React, { createContext, useContext, useId } from 'react'

import { useOpenPanels, type OpenPanels } from './useOpenPanels'
import { parentOf, type PanelId } from './panelState'

const AccordionContext = createContext<OpenPanels | null>(null)

function useAccordion(): OpenPanels {
  const ctx = useContext(AccordionContext)
  if (!ctx) throw new Error('<AccordionPanel> must be rendered inside <AccordionProvider>')
  return ctx
}

/**
 * The `?at=` jump target this page was arrived at with, for the component that owns that target to
 * scroll and focus itself. Null once consumed, and on any ordinary load.
 *
 * ⚑ DELIBERATELY NOT CONSUMED BY `AccordionPanel`, and the first draft got this wrong in a way worth
 * recording: it compared `jumpTarget` against the panel's own id. But D7a's example is
 * `?open=access&at=sg-12` — `at` names a **subject-grade group INSIDE** the Roles & Access panel,
 * not a panel. `'sg-12' === 'access'` is never true, so that effect was dead code that looked like a
 * working feature.
 *
 * The real consumer is the per-subject-grade group in PR 4, which does not exist yet — hence this
 * hook rather than a private context read: the target has to be reachable from a component that is
 * not an `AccordionPanel`. Until then `at` is parsed and scrubbed (so the URL contract holds and a
 * stale `at` cannot re-fire) and nothing acts on it. Do not wire scroll/focus to a panel id.
 */
export function useJumpTarget(): string | null {
  return useAccordion().jumpTarget
}

/**
 * Wraps the panel set and owns the shared open state.
 *
 * `available` is the list of panel ids the SERVER actually rendered for this caller — the role gate.
 * It is what makes D7a's "role-inaccessible ids are ignored silently" true by construction rather
 * than by a second role check on the client: an id the server never rendered can never be opened,
 * whatever the URL says.
 */
export function AccordionProvider({
  available,
  initialOpen,
  initialAt = null,
  children,
}: {
  available: readonly PanelId[]
  /** The open set the SERVER computed from the request query — see the ⚑ in `useOpenPanels`. */
  initialOpen: readonly PanelId[]
  /** The `?at=` jump target from the same request, or null. */
  initialAt?: string | null
  children: React.ReactNode
}) {
  const state = useOpenPanels(available, initialOpen, initialAt)
  return <AccordionContext.Provider value={state}>{children}</AccordionContext.Provider>
}

/** One disclosure panel. Heading rank and type size are derived from the id — see below. */
export function AccordionPanel({
  id,
  title,
  children,
}: {
  id: PanelId
  title: string
  children: React.ReactNode
}) {
  // ⚑ Rank is DERIVED from the id, never passed in. The id grammar already IS the nesting grammar
  // (`plans.upload` is nested by construction, and `panelState` pins the two-level cap), so a
  // `level` prop would be a second statement of the same fact — one that can silently disagree.
  // Forgetting it on a nested panel produced an `<h2>` at 20px inside another `<h2>`: no type error,
  // and the E2E `getByRole('heading', { name })` queries do not assert rank, so nothing would fail.
  const nested = parentOf(id) !== null
  const { isOpen, toggle } = useAccordion()
  const open = isOpen(id)
  const reactId = useId()
  const panelId = `manage-panel-${reactId}`

  // A top-level accordion header IS the 20px section heading it replaces; a nested one is the 18px
  // sub-region. Both come from the existing scale — see the heading-rank note in `app-tokens.scss`,
  // which makes that a rule rather than a preference.
  const Heading = nested ? 'h3' : 'h2'
  const headingClass = `lp-accordion__heading${nested ? '' : ' lp-accordion__heading--section'}`

  return (
    <section className="lp-accordion">
      <Heading className={headingClass}>
        <button
          type="button"
          className="lp-accordion__trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggle(id)}
        >
          {/* Decorative: the disclosure state is already carried by aria-expanded, so the marker is
              hidden from the accessibility tree rather than announced a second time as a character. */}
          <span className="lp-accordion__marker" aria-hidden="true" />
          {title}
        </button>
      </Heading>
      {/* `hidden` rather than conditional rendering — see the ⚑ in this file's header. */}
      <div className="lp-accordion__panel" id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
