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
import { LessonPlans } from './collections/LessonPlans'
import { LessonBundleVersions } from './collections/LessonBundleVersions'
import { LessonBundles } from './collections/LessonBundles'
import { generateArtifactTask } from './jobs/generateArtifact'
import { isSiteAdmin } from './access'

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
    // Brand the admin as "Lesson Plan Repository": titleSuffix sets the browser tab; the Icon
    // graphic replaces the nav mark. (The login-page Logo graphic is gone — /admin/login now
    // redirects to the single frontend login, so it was never seen.)
    meta: {
      titleSuffix: ' — Lesson Plan Repository',
    },
    components: {
      graphics: {
        Icon: '@/components/Brand/Icon#default',
      },
      // Wall-clock backstop that reliably logs out an idle/backgrounded tab at the token
      // deadline (Payload's single-timer auto-logout is unreliable when suspended).
      providers: ['@/components/IdleLogout#default'],
      // Top-of-page header carrying the SAME user menu as the frontend (username · Lessons ·
      // logout · avatar), so both surfaces match. Payload's own nav logout is hidden in
      // custom.scss for one logout everywhere. See src/components/AdminHeaderMenu.
      header: ['@/components/AdminHeaderMenu#default'],
      views: {
        // Teachers are excluded from /admin (SPEC §2): an authenticated non-admin who reaches the
        // panel is redirected to The App home instead of the hard "no admin access" error.
        unauthorized: { Component: '@/components/AdminUnauthorizedRedirect#default' },
        // (ONE login form: /admin/login → the frontend /login via a redirect in next.config.ts,
        // which fires at the routing layer before the admin routes resolve — so it can't 404.)
        // Replace Payload's default dashboard (collection-card boxes that duplicate the nav) with
        // a quiet, additive, role-aware landing. The rest of the admin shell stays Payload-native.
        dashboard: { Component: '@/components/AdminDashboard#default' },
      },
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // Order here drives the admin nav order (groups appear by first-seen): Lesson plans →
  // Curriculum (Subjects, Subject Grades) → People (Users). See each collection's admin.group.
  collections: [LessonPlans, LessonBundleVersions, LessonBundles, Subject, SubjectGrade, Users],
  // Jobs Queue (SPEC §9/§11; readiness #1) — heavy export generation runs async + throttled.
  // Defining a task creates the `payload-jobs` collection (a schema migration). The in-process
  // `autoRun` cron picks up enqueued jobs on the long-running app container (NOT for serverless,
  // per installed-source guidance — fine on the Rock). `limit` is the GLOBAL concurrency cap on
  // heavy conversions: at most this many run per tick regardless of how many users enqueued.
  // Completed jobs are kept (not auto-deleted) so the status poll can surface failures; periodic
  // cleanup is a follow-up. Cadence/limit are env-tunable for the host's CPU/Gotenberg budget.
  jobs: {
    tasks: [generateArtifactTask],
    // LOCK DOWN the job surface (Payload's defaults are permissive). Without this, the
    // `run` endpoint defaults to `() => true` (callable UNAUTHENTICATED), and `queue`/`cancel`
    // default to any-logged-in-user. Restrict all three to Site Admins. This does NOT affect
    // the system path: the export endpoint's `payload.jobs.queue(...)` and the `autoRun` runner
    // both use the Local API's default `overrideAccess: true`, so access control is bypassed for
    // them — only EXTERNAL REST callers are gated.
    access: {
      run: ({ req }) => isSiteAdmin(req.user),
      queue: ({ req }) => isSiteAdmin(req.user),
      cancel: ({ req }) => isSiteAdmin(req.user),
    },
    // The above gates the job-system endpoints, but the `payload-jobs` collection itself ships
    // with NO access block → it falls back to Payload's `defaultAccess` (any authenticated user),
    // so a Teacher could `POST /api/payload-jobs` to enqueue `generateArtifact` with an arbitrary
    // input, bypassing the export endpoint's read-gate + rate-limit. Lock the collection's REST
    // CRUD: nobody creates/updates/deletes jobs over the API (the system writes via overrideAccess
    // / direct DB), and only Site Admins may read them.
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      access: {
        ...defaultJobsCollection.access,
        read: ({ req }) => isSiteAdmin(req.user),
        create: () => false,
        update: () => false,
        delete: () => false,
      },
    }),
    autoRun: [
      {
        cron: process.env.JOBS_AUTORUN_CRON || '*/3 * * * * *', // every 3s (6-field: leading seconds)
        queue: 'default',
        limit: Number(process.env.JOBS_AUTORUN_LIMIT) || 2,
      },
    ],
  },
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
