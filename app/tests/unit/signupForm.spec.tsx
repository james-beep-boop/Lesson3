// @vitest-environment jsdom
/**
 * What a teacher is told when signing up (2026-10-19). On a site that sends email, a verification
 * link is on its way; on an email-less site (an offline school server) no link will ever arrive, so
 * the form must say BEFORE and AFTER signing up that a Site Administrator approves the account.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SignupForm } from '@/app/(frontend)/signup/SignupForm'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const signUp = async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ doc: { id: 7 } })))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Amina' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'amina@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
  return screen.findByRole('status')
}

describe('sign-up on a site that sends email', () => {
  it('promises a verification link, and says nothing about approval', async () => {
    render(<SignupForm emailEnabled />)
    expect(screen.queryByText(/does not send email/i)).toBeNull()
    const done = await signUp()
    expect(done.textContent).toMatch(/emailed a verification link to amina@example\.com/i)
    expect(done.textContent).not.toMatch(/approve/i)
  })
})

describe('sign-up on a site without email', () => {
  it('explains administrator approval before the teacher signs up', () => {
    render(<SignupForm emailEnabled={false} />)
    expect(screen.getByText(/This site does not send email/i).textContent).toMatch(
      /Site Administrator approves your account/i,
    )
  })

  it('confirms the account and names who approves it, never an email that cannot arrive', async () => {
    render(<SignupForm emailEnabled={false} />)
    const done = await signUp()
    expect(done.textContent).toMatch(/Account created for amina@example\.com/i)
    expect(done.textContent).toMatch(/Site Administrator needs to approve it/i)
    expect(done.textContent).not.toMatch(/emailed|verification link|inbox/i)
  })
})
