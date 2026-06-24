'use client'

/**
 * "Include ARES Resources" — the single control that replaces the old Standard/Compact toggle
 * (SPEC §9). Standard = the Resource column is present; Compact = it's dropped. Most users work in
 * one mode, so this is one checkbox (unchecked by default = no resources) that drives BOTH the
 * on-screen view and every download (DOCX/PDF), via the `?format=` the server already reads.
 *
 * It navigates rather than holds client state, so the server re-renders the view with the chosen
 * layout and the download links pick up the same format — one source of truth, per page.
 */
import React from 'react'
import { useRouter, usePathname } from 'next/navigation'

import { formatFromResources, resourcesIncluded } from '@/lib/format'

export function ResourcesToggle({ format }: { format: 'standard' | 'compact' }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <label className="resources-toggle">
      <input
        type="checkbox"
        checked={resourcesIncluded(format)}
        onChange={(e) => router.push(`${pathname}?format=${formatFromResources(e.target.checked)}`)}
      />
      Include ARES Resources
    </label>
  )
}
