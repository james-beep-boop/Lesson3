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
 *
 * Live while typing: Payload's `RowLabelProvider` is patched to stop re-rendering every row on every
 * keystroke (scripts/patch-payload-ui.mjs; docs/PLAN-editing-typing-speed-2026-10-23.md §4.2–§4.3),
 * so its `data` now catches up only on the server round-trip. The label therefore subscribes to the
 * one field it shows. A field present in form state wins even when empty, so clearing a title shows
 * "Lesson N", never the old title; `data` is the fallback only when the field is absent from state.
 */
import React from 'react'
import { useFormFields, useRowLabel } from '@payloadcms/ui'

import { formatRowLabel } from './formatRowLabel'

type Props = { field?: string; noun?: string }

export default function RowLabel(props: Props) {
  const { data, path, rowNumber } = useRowLabel<Record<string, unknown>>()
  const n = (rowNumber ?? 0) + 1 // rowNumber is 0-based (Payload Array/ArrayRow).
  const noun = props.noun ?? 'Row'

  const fieldState = useFormFields(([fields]) =>
    props.field ? fields[`${path}.${props.field}`] : undefined,
  )
  const raw = fieldState ? fieldState.value : props.field ? data?.[props.field] : undefined

  return <span>{formatRowLabel(noun, n, raw)}</span>
}
