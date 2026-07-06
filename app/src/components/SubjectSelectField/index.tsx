'use client'

/**
 * Admin input for `meta.subject` (decided 2026-07-05): a dropdown over the CURRENT `subjects`
 * taxonomy instead of free text, so a Site-Admin repair can only re-label the document to a real
 * subject (ingest resolves taxonomy by exact name match — a typo here would break that contract).
 *
 * The DATA stays a plain string (the generator's input grammar is unchanged); only the input
 * widget is constrained. Deliberately NO server-side validate: the field is already Site-Admin-only
 * (field access + the fieldSplit carve-out), and a hard validator would block saves of legacy
 * versions whose stored subject no longer matches a since-renamed taxonomy entry — the split
 * restores the stored value into every non-Site-Admin save, so validation would reject edits the
 * caller never made. The stored value is offered as an extra option when it isn't in the taxonomy,
 * so the control never blanks or silently rewrites it.
 */
import type { OptionObject, TextFieldClientProps } from 'payload'

import React, { useEffect, useState } from 'react'
import { SelectInput, useField } from '@payloadcms/ui'

import { buildSubjectOptions } from './options'

export default function SubjectSelectField(props: TextFieldClientProps) {
  const { field, path, readOnly } = props
  const { value, setValue, showError } = useField<string | null>({ path })
  const [subjects, setSubjects] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/subjects?limit=200&sort=name&depth=0', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { docs: [] }))
      .then((data: { docs?: Array<{ name?: string }> }) => {
        setSubjects((data.docs ?? []).map((d) => d.name).filter((n): n is string => Boolean(n)))
      })
      .catch(() => {}) // aborted / offline — the stored value still renders via the extra option
    return () => controller.abort()
  }, [])

  const options = buildSubjectOptions(subjects, value)

  return (
    <SelectInput
      label={field.label ?? 'Subject'}
      name={path}
      path={path}
      description={field.admin?.description}
      options={options}
      readOnly={readOnly}
      showError={showError}
      value={value ?? undefined}
      onChange={(option) => {
        const selected = option as OptionObject | null
        setValue(selected?.value ?? null)
      }}
    />
  )
}
