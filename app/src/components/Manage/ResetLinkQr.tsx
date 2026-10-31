'use client'

/**
 * The administrator's reset link drawn as a QR code (operator decision 2026-10-31), so that at a
 * school with no email the person can scan it with their phone on the school Wi-Fi instead of
 * retyping a long one-time address.
 *
 * ⚑ DRAWN HERE, IN THE BROWSER, FROM THE LINK ALREADY ON SCREEN. No new endpoint, no image service,
 * no request carrying the token anywhere: `uqr` (MIT, no dependencies) only computes the module grid,
 * and React draws it as one SVG path — no `dangerouslySetInnerHTML`. Offline schools have no
 * internet, so an online QR service would not work there and would leak a live credential besides.
 *
 * ⚑ ALWAYS DARK ON WHITE, IN BOTH THEMES. Phone scanners expect dark modules on a light ground with a
 * quiet zone around it; inverting for the dark theme makes many of them fail. These two colours are
 * part of the QR format, not theme colours, which is why they are literals.
 */
import React, { useMemo } from 'react'
import { encode } from 'uqr'

import { linkIsLoopback } from '../../lib/emailLinkBase'

/**
 * Error correction M: a little headroom for a smudged screen or glare, still coarse enough for a
 * ~100-character link to scan easily. Border 4 is the quiet zone the QR specification asks for.
 */
export const QR_OPTIONS = { ecc: 'M', border: 4 } as const

export function ResetLinkQr({ link, name }: { link: string; name: string }) {
  const loopback = linkIsLoopback(link)
  const drawing = useMemo(() => {
    if (loopback) return null
    const grid = encode(link, QR_OPTIONS).data
    // One path of unit squares rather than ~1,000 elements.
    const squares = grid.flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
    )
    return { size: grid.length, path: squares.join('') }
  }, [link, loopback])

  if (!drawing) {
    return (
      <p className="lp-users__qr-note" role="note">
        No QR code: this link points to this computer only, so a phone cannot open it. See{' '}
        <strong>Address in links</strong> under Manage &rarr; System &rarr; Installation status.
      </p>
    )
  }

  const { size, path } = drawing
  return (
    <figure className="lp-users__qr">
      <svg
        role="img"
        aria-label={`QR code of the password reset link for ${name}`}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
      >
        <rect width={size} height={size} fill="#fff" />
        <path d={path} fill="#000" />
      </svg>
      <figcaption>
        {name} scans this with their phone camera, on the school Wi-Fi, and chooses a new password.
        The link works once.
      </figcaption>
    </figure>
  )
}
