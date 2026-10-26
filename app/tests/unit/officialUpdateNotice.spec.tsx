// @vitest-environment jsdom
/**
 * The import notice's date uses the same two-pass rendering as `LocalTime`: the server pass prints the
 * UTC day (deterministic, so hydration matches), and the mounted client swaps in the reader's own day.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import OfficialUpdateNotice from '../../src/components/OfficialUpdateNotice'
import { formatDay } from '../../src/lib/formatDate'

const notice = {
  release: '14 Nov 2026',
  changedAt: '2026-12-03T23:30:00Z',
  previousSemver: '2.0.0',
}

afterEach(cleanup)

describe('OfficialUpdateNotice', () => {
  it('server-renders the UTC day, then shows the reader’s own day', () => {
    const html = renderToString(<OfficialUpdateNotice {...notice} />)
    expect(html).toContain('03 Dec 2026')
    const { getByRole } = render(<OfficialUpdateNotice {...notice} />)
    expect(getByRole('note').textContent).toBe(
      `Official updated to the ARES release of 14 Nov 2026 on ${formatDay(notice.changedAt)}. The previous Official (2.0.0) is still in the version history.`,
    )
  })

  it('says when the release date and the previous Official are unknown', () => {
    const { getByRole } = render(
      <OfficialUpdateNotice release={null} changedAt={notice.changedAt} previousSemver={null} />,
    )
    expect(getByRole('note').textContent).toBe(
      `Official updated to an ARES release (date not stated) on ${formatDay(notice.changedAt)}.`,
    )
  })
})
