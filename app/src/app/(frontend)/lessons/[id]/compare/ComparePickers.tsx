'use client'

/**
 * The two version pickers on the compare page. Selection navigates (GET — the page is a server
 * component keyed on ?from/?to), so this is the only client piece of the compare view.
 */
import React from 'react'
import { useRouter } from 'next/navigation'

export type CompareOption = { id: number; label: string }

export default function ComparePickers({
  planId,
  options,
  fromId,
  toId,
}: {
  planId: number
  options: CompareOption[]
  fromId: number
  toId: number
}) {
  const router = useRouter()
  const go = (from: number, to: number) =>
    router.push(`/lessons/${planId}/compare?from=${from}&to=${to}`)

  const select = (which: 'from' | 'to', value: number) => (
    <select
      className="compare-picker"
      aria-label={which === 'from' ? 'Compare from version' : 'Compare to version'}
      value={value}
      onChange={(e) => {
        const picked = Number(e.target.value)
        go(which === 'from' ? picked : fromId, which === 'to' ? picked : toId)
      }}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )

  return (
    <div className="compare-controls">
      {select('from', fromId)}
      <span aria-hidden="true">→</span>
      {select('to', toId)}
    </div>
  )
}
