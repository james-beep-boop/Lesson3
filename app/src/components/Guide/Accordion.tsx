'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

import { parentOf, withAncestors, type GuidePanelId } from './panelState'

interface GuideAccordionState {
  isOpen: (id: GuidePanelId) => boolean
  toggle: (id: GuidePanelId) => void
}

const GuideAccordionContext = createContext<GuideAccordionState | null>(null)

function useGuideAccordion(): GuideAccordionState {
  const context = useContext(GuideAccordionContext)
  if (!context) throw new Error('<GuideAccordionPanel> must be inside <GuideAccordion>')
  return context
}

export function GuideAccordion({
  available,
  initialOpen,
  focusTarget,
  children,
}: {
  available: readonly GuidePanelId[]
  initialOpen: readonly GuidePanelId[]
  focusTarget: GuidePanelId | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState<GuidePanelId[]>(() => [...initialOpen])
  // `available` is a stable, server-computed prop for the lifetime of the page — recompute the Set
  // only when it actually changes, not on every open/close re-render.
  const availableSet = useMemo(() => new Set(available), [available])

  useEffect(() => {
    if (!focusTarget) return
    const trigger = document.getElementById(`guide-trigger-${focusTarget}`)
    if (!(trigger instanceof HTMLButtonElement)) return
    trigger.scrollIntoView({ block: 'start' })
    trigger.focus({ preventScroll: true })
  }, [focusTarget])

  const state: GuideAccordionState = {
    isOpen: (id) => open.includes(id),
    toggle: (id) => {
      if (!availableSet.has(id)) return
      setOpen((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id && parentOf(item) !== id)
          : withAncestors([...current, id]),
      )
    },
  }

  return <GuideAccordionContext.Provider value={state}>{children}</GuideAccordionContext.Provider>
}

export function GuideAccordionPanel({
  id,
  title,
  subtitle,
  anchorId,
  children,
}: {
  id: GuidePanelId
  title: string
  subtitle?: string
  /** Retain the previous public guide anchors when a section becomes an accordion. */
  anchorId?: string
  children: React.ReactNode
}) {
  const nested = parentOf(id) !== null
  const Heading = nested ? 'h3' : 'h2'
  const { isOpen, toggle } = useGuideAccordion()
  const open = isOpen(id)
  // Every GuidePanelId is rendered exactly once on the page, so `id` is already a stable, unique
  // key — no need for `useId()`'s generated one.
  const panelId = `guide-panel-${id}`
  const triggerId = `guide-trigger-${id}`

  return (
    <section
      className={`guide-accordion__item${nested ? ' guide-accordion__item--nested' : ''}`}
      id={anchorId ?? id}
    >
      <Heading className="guide-accordion__heading">
        <button
          id={triggerId}
          type="button"
          className="guide-accordion__trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggle(id)}
        >
          <span className="guide-accordion__title">{title}</span>
          <span className="guide-accordion__marker" aria-hidden="true" />
        </button>
      </Heading>
      {subtitle && <p className="guide-accordion__subtitle">{subtitle}</p>}
      <div
        className="guide-accordion__panel"
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        hidden={!open}
      >
        {children}
      </div>
    </section>
  )
}
