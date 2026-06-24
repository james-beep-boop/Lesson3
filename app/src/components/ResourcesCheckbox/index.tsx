import React from 'react'

/**
 * The "Include ARES Resources" checkbox shared by the admin export + preview controls (one label +
 * style, so they can't drift). Unchecked by default = no Resource column. The caller maps the
 * boolean to a format via lib/format `formatFromResources`.
 */
export function ResourcesCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      Include ARES Resources
    </label>
  )
}
