'use client'

/**
 * RowLabel — a generic collapsed-row label for the bundle's nested arrays (lessons,
 * framework phases, FE sections, summary-table rows, rubric rows). Configured per array via
 * `admin.components.RowLabel` `clientProps`:
 *
 *   { field: 'title', noun: 'Lesson' }   →  "Lesson 1 — Carbohydrates"
 *   { field: 'phase', noun: 'Phase' }     →  "Phase 2 — Observe Phase"
 *
 * Without a meaningful value it falls back to "<noun> N" (and to "Row N" if even `noun` is
 * missing), so an empty new row still reads sensibly. `field` is read from the row `data`
 * (prose fields are plain strings — we show the first line, truncated). One component, one
 * importMap entry; the per-array difference is pure config.
 */
import React from 'react'
import { useRowLabel } from '@payloadcms/ui'

type Props = { field?: string; noun?: string }

const firstLine = (s: string): string => s.trim().split('\n')[0]!.trim()
const truncate = (s: string, max = 60): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export default function RowLabel(props: Props) {
  const { data, rowNumber } = useRowLabel<Record<string, unknown>>()
  const n = (rowNumber ?? 0) + 1 // rowNumber is 0-based (Payload Array/ArrayRow).
  const noun = props.noun ?? 'Row'

  const raw = props.field ? data?.[props.field] : undefined
  const value = typeof raw === 'string' && raw.trim() ? truncate(firstLine(raw)) : ''

  return <span>{`${noun} ${n}${value ? ` — ${value}` : ''}`}</span>
}
