'use client'

import React from 'react'
import Link from 'next/link'
import type { DefaultCellComponentProps } from 'payload'

import { lessonDisplayName } from '@/lib/substrand'

/**
 * List cell for a Lesson Bundle Version's `title`. The stored title is shouty and prefixed
 * ("PHYSICS GRADE 10: INTRODUCTION TO SPACE PHYSICS") — which duplicated the Subject Grade column and,
 * alongside the (now-dropped) `lessonPlan` column, showed the same text three times per row. Render
 * the clean structured `meta.substrand_name` when present, else strip the "SUBJECT GRADE N:" prefix
 * off the stored title. Display-only (the stored `title` / `useAsTitle` are unchanged, so breadcrumbs
 * and relationship displays elsewhere keep the full label).
 *
 * A custom Cell REPLACES Payload's default link wrapping, so we re-add the edit-view link ourselves
 * (Payload passes `link` + the computed `linkURL`) to preserve click-to-open on the title column.
 *
 * `rowData.meta` is available because the list view fetches WHOLE documents by default (Payload only
 * narrows to the visible columns when `admin.enableListViewSelectAPI` is set — which this collection
 * does not). If that flag is ever enabled here, also select `meta.substrand_name`, or this cell
 * silently falls back to the de-shouted title.
 */
export default function VersionTitleCell({
  cellData,
  rowData,
  link,
  linkURL,
  collectionSlug,
}: DefaultCellComponentProps) {
  const raw = typeof cellData === 'string' ? cellData : ''
  const meta = rowData?.meta as { substrand_name?: string } | undefined
  const label = lessonDisplayName(meta?.substrand_name, raw)

  if (!link) return <span>{label}</span>
  const href = linkURL || `/admin/collections/${collectionSlug}/${rowData?.id}`
  return <Link href={href}>{label}</Link>
}
