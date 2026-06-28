import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  // Required by the generated Dockerfile (copies .next/standalone).
  output: 'standalone',
  // One login form (SPEC §2): send Payload's admin login to the single frontend /login. A static
  // config redirect fires at the routing layer BEFORE the /admin routes resolve, so it can't 404
  // and needs no middleware. Everyone lands on The App home after signing in; admins use the
  // "Admin" link in the header to enter /admin.
  async redirects() {
    return [{ source: '/admin/login', destination: '/login', permanent: false }]
  },
  // Baseline security headers (hardening backlog #3). Deliberately NO script-src/default-src in the
  // baseline CSP: Next.js relies on inline hydration scripts, so a strict global policy needs nonce
  // plumbing (a separate, larger task). These directives harden without breaking hydration — block
  // plugins/embeds, base-tag hijack, and clickjacking.
  //
  // Two rules, on purpose: a next.config CSP on `/:path*` OVERRIDES (not intersects) a route handler's
  // own Response CSP — only one CSP header reaches the client (verified by the tests/http e2e + curl,
  // 2026-06-28). The preview endpoint sets a stricter `default-src 'none'` on its Response, so:
  //   (1) the non-CSP headers apply to EVERY route (incl. preview), but
  //   (2) the baseline CSP is applied to every route EXCEPT the preview endpoint (negative-lookahead
  //       source), leaving the preview's own strict standalone CSP uncontested.
  async headers() {
    const baseline = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ]
    const baselineCsp = {
      key: 'Content-Security-Policy',
      value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    }
    return [
      { source: '/:path*', headers: baseline },
      // Exclude `/api/lesson-bundle-versions/:id/preview` so its Response CSP (default-src 'none') wins.
      { source: '/((?!api/lesson-bundle-versions/[^/]+/preview).*)', headers: [baselineCsp] },
    ]
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
