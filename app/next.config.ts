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
  // Baseline security headers on every route (hardening backlog #3). Deliberately does NOT set a
  // script-src/default-src CSP: Next.js relies on inline hydration scripts, so a strict policy needs
  // nonce plumbing (a separate, larger task). These directives harden without breaking hydration —
  // block plugins/embeds, base-tag hijack, and clickjacking.
  // CAVEAT (verified by tests/http e2e 2026-06-28): this `/:path*` CSP OVERRIDES, not intersects, the
  // stricter `default-src 'none'` CSP the preview endpoint sets on its own Response — only this one
  // reaches the client. So the preview does NOT currently get its intended strict standalone CSP
  // (low-risk: preview HTML is DOMPurify-sanitized + script-free). Tracked as a follow-up; the fix is
  // to scope this rule to exclude the preview path (and verify header precedence by curl).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          {
            key: 'Content-Security-Policy',
            value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
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
