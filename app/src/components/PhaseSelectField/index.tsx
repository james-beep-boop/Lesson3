'use client'

import React from 'react'
import type { SelectFieldClientProps } from 'payload'
import { useField, useFormSubmitted, withCondition } from '@payloadcms/ui'
import { isPhase, PHASE_OPTIONS } from '../../fields/phases'

const validatePhase = (value: unknown): true | string =>
  isPhase(value) || 'Choose a phase from the list.'

/** Five fixed choices: typing must never look like entering a new phase name. */
function PhaseSelectField({ path, readOnly }: SelectFieldClientProps) {
  const { value, setValue, disabled, showError } = useField<string | null>({
    path,
    validate: validatePhase,
  })
  const id = `field-${path.replaceAll('.', '__')}`
  // Revealing a collapsed row can refresh its field state. Keep the required-choice explanation
  // tied to the actual value after a save attempt, until the user selects a valid phase.
  const submitted = useFormSubmitted()
  const invalid = (showError || submitted) && !isPhase(value)
  return (
    <div className="field-type lp-phase-select">
      <label className="field-label" htmlFor={id}>
        Phase <span className="lp-phase-select__required">*</span>
      </label>
      <select
        id={id}
        name={path}
        required
        disabled={readOnly || disabled}
        value={value ?? ''}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="" disabled>
          Choose a phase
        </option>
        {PHASE_OPTIONS.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {invalid && (
        <div id={`${id}-error`} className="lp-phase-select__error">
          Choose a phase from the list.
        </div>
      )}
    </div>
  )
}

export default withCondition(PhaseSelectField)
