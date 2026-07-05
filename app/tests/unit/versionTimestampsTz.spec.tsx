// @vitest-environment jsdom
/**
 * VersionTimestamps TZ-hydration pin (fix 2026-07-05, sibling of lessonControlsSsr.spec.tsx).
 *
 * The sidebar timestamps are shown user-local, but a `toLocaleString(undefined, …)` differs
 * between the server (container TZ — UTC on docker/the Rock) and a browser in another zone, which
 * threw React #418 + a full client re-render on every version-document load. The fix is two-pass:
 * server AND first client render emit a DETERMINISTIC string (explicit en-US locale + explicit
 * UTC, so the trees match regardless of either side's TZ/ICU), then the first post-hydration
 * render (useSyncExternalStore server/client snapshots) swaps in the reader's local rendering.
 * (`suppressHydrationWarning` was rejected: React 19 keeps the server
 * text, silently showing UTC times to non-UTC readers — browser-A/B-verified.)
 *
 * A cross-TZ mismatch can't be reproduced in-process (server render and hydration share this
 * runner's single TZ), so this pins the two properties the fix reduces to — the server string is
 * TZ-independent by construction, and the mounted client swaps to the local, unsuffixed form. The
 * end-to-end proof is the Playwright timezoneId A/B recorded in DECISIONS 2026-07-05.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { render, screen } from '@testing-library/react'

const UPDATED = '2026-07-05T18:00:00.000Z'
const CREATED = '2026-07-01T09:30:00.000Z'

vi.mock('@payloadcms/ui', () => ({
  useFormFields: (selector: (args: [Record<string, { value: unknown }>]) => unknown) =>
    selector([{ updatedAt: { value: UPDATED }, createdAt: { value: CREATED } }]),
}))

import VersionTimestamps from '@/components/VersionTimestamps'

describe('VersionTimestamps is hydration-safe across server/browser timezones', () => {
  it('server pass renders the deterministic UTC-labelled string (TZ-independent by construction)', () => {
    const html = renderToString(<VersionTimestamps />)
    // Exact strings: explicit en-US + explicit UTC must yield this REGARDLESS of the machine TZ
    // this test happens to run under (Mac local, CI UTC, the Rock…).
    expect(html).toContain('July 5, 2026 at 6:00 PM UTC')
    expect(html).toContain('July 1, 2026 at 9:30 AM UTC')
  })

  it('after mount the value swaps to the reader-local rendering (UTC label gone)', async () => {
    render(<VersionTimestamps />)
    // The local form never carries the explicit " UTC" suffix, so this proves the post-mount swap
    // even when the test machine's TZ IS UTC (CI) and the wall-clock text would coincide.
    const expected = new Date(UPDATED).toLocaleString(undefined, {
      dateStyle: 'long',
      timeStyle: 'short',
    })
    expect(await screen.findByText(expected)).toBeTruthy()
    expect(screen.queryByText('July 5, 2026 at 6:00 PM UTC')).toBeNull()
  })
})
