/**
 * Strict, nonce-based CSP for every DOCUMENT route (Codex 2026-07-05 #2, Phase 5 A3).
 *
 * The next.config baseline CSP deliberately omitted `default-src`/`script-src` because Next.js
 * hydrates via inline scripts — a strict policy needs a per-request nonce, which static
 * `headers()` rules can't mint. This middleware closes that gap: it generates a nonce per
 * request, sets the full policy on the RESPONSE, and forwards the same policy as a REQUEST
 * header — Next's app renderer reads the nonce from the incoming `content-security-policy`
 * header (`getScriptNonceFromHeader`, verified in installed next@16 app-render.js) and stamps it
 * onto every framework/inline script it emits, on both surfaces (frontend AND the Payload admin,
 * whose root layout injects no raw <script> of its own — verified @payloadcms/next dist).
 *
 * Scope — documents only. The matcher excludes:
 *   - `/api/*`: JSON/binary responses don't render, so a CSP there is dead weight — and the
 *     preview endpoint's OWN strict `default-src 'none'` Response CSP (see next.config notes,
 *     2026-06-28) must keep reaching the client uncontested. This supersedes the old
 *     negative-lookahead `headers()` rule that put a baseline CSP on non-preview API routes.
 *   - `/_next/static`, `/_next/image`, `favicon.ico`: immutable assets, no documents.
 *   - prefetch requests (`missing` header conditions, per the Next CSP guide): their RSC
 *     payloads are client-cached and carry no document either.
 *
 * Directive notes:
 *   - `script-src 'nonce-…' 'strict-dynamic'`: nonce admits Next's bootstrap scripts;
 *     strict-dynamic lets those load the chunk graph. `'self'` is the fallback for pre-CSP3
 *     browsers (ignored by browsers that honor strict-dynamic).
 *   - `style-src 'unsafe-inline'`: React style attributes + the app's few inline <style>
 *     elements (e.g. AdminHeaderMenu's role-scoped CSS). Style injection is not the XSS class
 *     this policy is containing; scripts stay nonce-only.
 *   - dev adds `'unsafe-eval'` + ws: (HMR/react-refresh); production never includes them.
 *   - object-src/base-uri/frame-ancestors/form-action carry over from the old baseline CSP.
 *
 * Known, accepted caveat (browser-verified 2026-07-05): the ONLY build-time-prerendered documents
 * are Next's `_not-found`/`_global-error` shells (every real route is dynamic — auth). Their HTML
 * is minted at build time, so it carries no nonce and their scripts are blocked: a DIRECT load of
 * an unknown URL shows the (pure-text, zero-interactivity) 404 page unhydrated, with console
 * noise. Client-side navigation to an unknown route renders not-found in the already-hydrated
 * document and is unaffected. Not worth forcing those shells dynamic for.
 */
import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest): NextResponse {
  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes))

  const dev = process.env.NODE_ENV !== 'production'
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  // Next's renderer extracts the nonce from THIS header and stamps its inline/framework scripts.
  requestHeaders.set('content-security-policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
