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
  // Baseline non-CSP security headers (hardening backlog #3) on every route. The CSP moved to
  // src/middleware.ts (Phase 5 A3): a strict `default-src`/`script-src` policy needs a per-request
  // nonce, which static headers() rules can't mint. Middleware covers document routes only and
  // skips `/api/*`, so the preview endpoint's own strict `default-src 'none'` Response CSP still
  // reaches the client uncontested (the old negative-lookahead CSP rule here is superseded —
  // history: a next.config CSP OVERRIDES a route handler's Response CSP, verified 2026-06-28).
  async headers() {
    const baseline = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ]
    return [{ source: '/:path*', headers: baseline }]
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
