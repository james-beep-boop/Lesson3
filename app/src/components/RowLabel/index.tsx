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

import { formatRowLabel } from './formatRowLabel'

type Props = { field?: string; noun?: string }

export default function RowLabel(props: Props) {
  const { data, rowNumber } = useRowLabel<Record<string, unknown>>()
  const n = (rowNumber ?? 0) + 1 // rowNumber is 0-based (Payload Array/ArrayRow).
  const noun = props.noun ?? 'Row'

  const raw = props.field ? data?.[props.field] : undefined

  return <span>{formatRowLabel(noun, n, raw)}</span>
}
