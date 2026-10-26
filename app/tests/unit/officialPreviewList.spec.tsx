// @vitest-environment jsdom
import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import OfficialPreviewList from '../../src/components/UploadBundles/OfficialPreviewList'
import type { OfficialPreview } from '../../src/ingest/releaseDecision'

it('separates Official moves, waiting releases and unchanged files while retaining older-content warnings', () => {
  const moving: OfficialPreview = {
    file: 'move.json',
    plan: 1,
    title: 'Moving lesson',
    currentOfficial: 1,
    incomingSemver: '3.0.0',
    previousSemver: '2.0.0',
    release: { id: 'November', date: '2026-11-14' },
    fingerprint: 'test',
    decision: 'new',
    willMove: true,
    reason: 'The current Official is an ARES release.',
    olderContent: '1.0.0',
  }
  render(
    <OfficialPreviewList
      preview={[
        moving,
        {
          ...moving,
          file: 'wait.json',
          title: 'Waiting lesson',
          willMove: false,
          olderContent: null,
          reason: 'A teacher’s version is Official; waiting for the subject-grade administrator.',
        },
        {
          ...moving,
          file: 'same.json',
          title: 'Unchanged lesson',
          decision: 'alreadyHere',
          willMove: false,
          olderContent: null,
          reason: 'Unchanged — ARES release already here, version 2.0.0',
        },
      ]}
    />,
  )
  const moves = within(screen.getByRole('region', { name: 'Will become Official' }))
  expect(moves.getByText('2.0.0 → 3.0.0 · ARES release 14 Nov 2026')).toBeTruthy()
  expect(moves.getByText(/Importing it will make this content Official again/)).toBeTruthy()
  const waiting = screen.getByRole('region', {
    name: 'Waiting for the subject-grade administrator',
  })
  expect(waiting.textContent).toContain('New version 3.0.0; Official stays 2.0.0')
  expect(waiting.textContent).not.toContain('Importing it will make this content Official again')
  expect(screen.getByRole('region', { name: 'No change' }).textContent).toContain(
    'ARES release already here',
  )
})
