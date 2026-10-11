'use client'

import React, { useId } from 'react'

/** Shared composer field: the hint describes the control without becoming part of its name. */
export default function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (ids: { id: string; 'aria-describedby'?: string }) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children({ id, ...(hint ? { 'aria-describedby': `${id}-hint` } : {}) })}
      {hint && (
        <span id={`${id}-hint`} className="form-field__hint">
          {hint}
        </span>
      )}
    </div>
  )
}
