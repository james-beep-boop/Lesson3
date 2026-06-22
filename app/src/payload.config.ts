import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Subject } from './collections/Subject'
import { SubjectGrade } from './collections/SubjectGrade'
import { LessonBundles } from './collections/LessonBundles'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Auth-token signing / session integrity depend on this secret. An empty secret silently
// weakens that, so fail fast at server runtime in production rather than booting with a
// blank shared secret. The check is SKIPPED during `next build` (NEXT_PHASE), where this
// config is imported for static page-data collection with NODE_ENV=production but WITHOUT
// the runtime env injected (secrets arrive at container runtime via --env-file). Dev/test
// still default to '' so the app boots without env wiring.
const payloadSecret = process.env.PAYLOAD_SECRET || ''
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'
if (process.env.NODE_ENV === 'production' && !isNextBuild && !payloadSecret) {
  throw new Error('PAYLOAD_SECRET is required in production (refusing to boot with an empty secret).')
}

// Email adapter is opt-in via env so the app boots (console fallback) without SMTP
// creds. When SMTP_HOST is set (runtime .env), real mail is sent — e.g. password
// resets, which otherwise only log "Email attempted without being configured".
// skipVerify keeps app boot decoupled from SMTP reachability; delivery is tested
// separately. Port 465 = implicit TLS; anything else (e.g. 587) = STARTTLS.
const smtpPort = Number(process.env.SMTP_PORT) || 465
const email = process.env.SMTP_HOST
  ? await nodemailerAdapter({
      defaultFromName: process.env.EMAIL_FROM_NAME || 'ARES Lesson Library',
      defaultFromAddress:
        process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'no-reply@localhost',
      skipVerify: true,
      transportOptions: {
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      },
    })
  : undefined

export default buildConfig({
  email,
  // Absolute base URL. Setting it makes Payload add it to the CSRF allowlist, which then
  // requires cookie-auth requests to carry a matching Origin OR a `Sec-Fetch-Site` header
  // — browsers that send neither on same-origin GETs (e.g. older Safari) get bounced back
  // to login. So we default it to '' (empty → NOT pushed to csrf → cookie auth works for
  // all browsers; CSRF is still covered by the SameSite=Lax cookie). The reset-email link
  // base comes from ADMIN_URL instead (see Users auth). A public HTTPS host may set
  // SERVER_URL to opt into strict CSRF. Must be '' (not undefined) — undefined still gets
  // pushed to csrf. See docs/DECISIONS.md.
  serverURL: process.env.SERVER_URL || '',
  admin: {
    user: Users.slug,
    // Brand the admin as "Lesson Plan Repository 3" instead of Payload: titleSuffix sets the
    // browser tab; the graphics components replace the login-page logo and the nav mark.
    meta: {
      titleSuffix: ' — Lesson Plan Repository 3',
    },
    components: {
      graphics: {
        Logo: '@/components/Brand/Logo#default',
        Icon: '@/components/Brand/Icon#default',
      },
      // Wall-clock backstop that reliably logs out an idle/backgrounded tab at the token
      // deadline (Payload's single-timer auto-logout is unreliable when suspended).
      providers: ['@/components/IdleLogout#default'],
      // Teachers are excluded from /admin (SPEC §2). Override Payload's built-in "unauthorized"
      // view so an authenticated non-admin (e.g. a Teacher logging in at /admin) is redirected
      // to The App home instead of seeing the hard "no admin access" error.
      views: {
        unauthorized: { Component: '@/components/AdminUnauthorizedRedirect#default' },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Subject, SubjectGrade, LessonBundles],
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || '',
    },
  }),
  sharp,
  plugins: [],
})
