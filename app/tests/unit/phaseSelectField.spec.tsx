// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SelectFieldClientProps } from 'payload'

const state = vi.hoisted(() => ({
  value: null as string | null,
  submitted: true,
  disabled: false,
  setValue: vi.fn(),
}))
vi.mock('@payloadcms/ui', () => ({
  withCondition: (Component: unknown) => Component,
  useFormSubmitted: () => state.submitted,
  // An expanded row can be freshly registered as valid even though its required choice is empty.
  useField: () => ({ ...state, showError: false, errorMessage: undefined }),
}))
import PhaseSelectField from '../../src/components/PhaseSelectField'
const props = {
  path: 'lessons.0.framework.5.phase',
  field: { type: 'select', name: 'phase' },
} as SelectFieldClientProps
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.value = null
  state.submitted = true
  state.disabled = false
})

describe('phase selection after a rejected save', () => {
  it('keeps the explanation when a previously collapsed empty field mounts', () => {
    render(<PhaseSelectField {...props} />)
    const input = screen.getByRole('combobox', { name: /Phase/ })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Choose a phase from the list.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('clears the explanation once an actual option has been chosen', () => {
    const { rerender } = render(<PhaseSelectField {...props} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Predict Phase' } })
    expect(state.setValue).toHaveBeenCalledWith('Predict Phase')
    state.value = 'Predict Phase'
    rerender(<PhaseSelectField {...props} />)
    expect(screen.queryByText('Choose a phase from the list.')).toBeNull()
    expect(screen.getByRole('combobox').hasAttribute('aria-invalid')).toBe(false)
  })
})
