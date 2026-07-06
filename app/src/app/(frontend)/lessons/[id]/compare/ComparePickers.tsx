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

  const opts = options.map((o) => (
    <option key={o.id} value={o.id}>
      {o.label}
    </option>
  ))

  return (
    <div className="compare-controls">
      <select
        className="compare-picker"
        aria-label="Compare from version"
        value={fromId}
        onChange={(e) => go(Number(e.target.value), toId)}
      >
        {opts}
      </select>
      <span aria-hidden="true">→</span>
      <select
        className="compare-picker"
        aria-label="Compare to version"
        value={toId}
        onChange={(e) => go(fromId, Number(e.target.value))}
      >
        {opts}
      </select>
    </div>
  )
}
