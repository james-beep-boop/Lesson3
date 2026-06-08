import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Subject } from './collections/Subject'
import { SubjectGrade } from './collections/SubjectGrade'
import { LessonBundles } from './collections/LessonBundles'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

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
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Subject, SubjectGrade, LessonBundles],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
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
