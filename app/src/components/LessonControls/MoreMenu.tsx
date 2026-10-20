'use client'

/**
 * The editor's More ▾ menu (2026-10-20): the less-used tools, shown only when a Site Administrator
 * has switched Advanced tools on (`lib/advancedTools.ts`). Insert link is deliberately NOT here — it
 * is an everyday tool (operator decision 2026-10-20).
 *
 * A disclosure, not an ARIA `menu`: a button that says whether it is open, and a short list of
 * ordinary buttons reached with Tab. Escape closes it and returns focus to the button; a click
 * outside closes it; choosing an item closes it and returns focus to the button.
 */
import React, { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@payloadcms/ui'

export interface MoreMenuItem {
  key: string
  label: string
  onSelect: () => void
  disabled?: boolean
}

export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  if (!items.length) return null
  return (
    <div className="lp-more" ref={wrap}>
      <Button
        ref={trigger}
        buttonStyle="secondary"
        size="small"
        extraButtonProps={{ 'aria-expanded': open, 'aria-controls': listId }}
        onClick={() => setOpen((current) => !current)}
      >
        More ▾
      </Button>
      {open && (
        <div id={listId} className="lp-more__list">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="lp-more__item"
              disabled={item.disabled}
              onClick={() => {
                // Focus goes back to More ▾ BEFORE the action: closing removes the focused item,
                // which would otherwise drop keyboard users on <body>. An action that opens a
                // dialog still takes focus from here as usual.
                setOpen(false)
                trigger.current?.focus()
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
