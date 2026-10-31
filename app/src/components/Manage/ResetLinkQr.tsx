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

/** Four modules of white margin: the quiet zone the QR specification asks for. */
const QUIET_ZONE = 4

/**
 * True when the link names this computer only (`localhost`, a loopback address), which a phone
 * cannot reach: on the phone, "localhost" is the phone. Happens when the installer was given no
 * `LESSON3_URL` (docs/LOCAL-SERVER-DEPLOYMENT.md). An unparseable link counts as unreachable too.
 */
export function linkOnlyWorksOnThisComputer(link: string): boolean {
  let host: string
  try {
    host = new URL(link).hostname.toLowerCase()
  } catch {
    return true
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    /^127\./.test(host)
  )
}

export function ResetLinkQr({ link, name }: { link: string; name: string }) {
  // Error correction M: a little headroom for a smudged screen or glare, still small enough for a
  // ~100-character link to stay coarse and easy to scan.
  const { size, path } = useMemo(() => {
    const grid = encode(link, { ecc: 'M', border: QUIET_ZONE }).data
    // One path of unit squares rather than ~2,000 elements.
    const squares = grid.flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
    )
    return { size: grid.length, path: squares.join('') }
  }, [link])

  if (linkOnlyWorksOnThisComputer(link)) {
    return (
      <p className="lp-users__qr-note" role="note">
        No QR code: this link points to this computer only, so a phone cannot open it. Ask whoever
        installed the server to set the school&rsquo;s address (<code>LESSON3_URL</code>).
      </p>
    )
  }

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
