import type { CollectionConfig } from 'payload'
import type { User } from '../payload-types'

import {
  adminPanelAccess,
  assignmentsReadField,
  assignmentsUpdateField,
  canManageUsers,
  emailReadAccess,
  selfOrSiteAdminField,
  siteAdminField,
  siteAdminOnly,
  usersCollectionCreate,
  usersCollectionRead,
  usersCollectionUpdate,
} from '../access'
import {
  autoDemotePriorSubjectAdmins,
  enforceAssignmentScope,
  grantSiteAdminToFirstUser,
  guardPasswordChange,
} from '../hooks/userRoles'
import { rateLimitAuthOperations } from '../hooks/authRateLimit'
import { emailLinkBase } from '../lib/emailLinkBase'
import { isHttpsServerUrl } from '../lib/publicPosture'
import { assignEditorEndpoint, unassignEditorEndpoint } from '../endpoints/userAssignments'
import { verifyEmailThrottledEndpoint } from '../endpoints/verifyEmail'
import { forgotPasswordQueuedEndpoint } from '../endpoints/forgotPassword'
import { cascadeDeleteUserFavorites } from './Favorites'
import { cascadeDeleteUserMessages } from './Messages'

/**
 * Users + roles (SPEC §8).
 *
 *  - `roles` (global): contains 'siteAdmin' for Site Administrators. Empty for everyone else.
 *  - `assignments` (per subject-grade): each row grants 'subjectAdmin' or 'editor' for one
 *    SubjectGrade. A user with neither a site-admin role nor any assignment is a Teacher
 *    (view/export only) — the implicit default.
 *
 * Security fixes over the scaffold default: admin-panel access is gated (editors/subject
 * admins/site admins only, not teachers); the title is `name`, not `email`; `email` is
 * readable only by its owner and site admins.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    // 2-hour inactivity window (a comfortable work session; was 15 min — too short in practice,
    // 2026-07-04). With admin.autoRefresh off (the default), the admin shows a "Stay logged in?"
    // prompt ~1 min before expiry and force-logs-out at expiry if unattended — so a walked-away
    // session (even with the tab open) still clears itself. Active editors get one prompt per
    // window; explicit Log Out is immediate. IdleLogout enforces the deadline on stale tabs.
    tokenExpiration: 7200,
    // Secure derives from the public posture (Phase 5 A5): an https SERVER_URL means the auth
    // cookie refuses plaintext transport — Codex #1's "Secure-cookie check" made structural.
    // Internal hosts (SERVER_URL empty/http) keep today's behavior; sameSite stays Payload's
    // Lax default (the CSRF property the mark-read POST relies on).
    cookies: { secure: isHttpsServerUrl(process.env.SERVER_URL) },
    // NOTE: there is deliberately no `forgotPassword.generateEmailHTML` here any more (L3-R1,
    // 2026-07-20). The reset email is no longer sent inline by the operation — the shadowing
    // `forgotPasswordQueuedEndpoint` runs it with `disableEmail: true` and hands delivery to the
    // retrying `passwordResetEmail` job, which now owns the template. Re-adding a generator here
    // would be dead code on the app's own path (the endpoint disables it), so if you need to change
    // the reset email, change `jobs/passwordResetEmail.ts`.
    // Email verification on signup (2026-07-09 follow-up hardening to open registration): a new
    // account cannot log in until its address is verified — Payload enforces this in BOTH the
    // login op (UnverifiedEmail 403) and the JWT strategy. The link targets the FRONTEND page for
    // the same reason as the reset link above. Payload's default link would point at
    // /admin/users/verify/<token> — a panel route teachers can't use.
    verify: {
      generateEmailHTML: (args) => {
        const token = (args as { token?: string } | undefined)?.token ?? ''
        const url = `${emailLinkBase()}/verify-email?token=${token}`
        return `<p>Welcome to ARES Lesson Plans.</p>
<p><a href="${url}">Verify your email address</a> (or paste this link): ${url}</p>
<p>You'll be able to sign in once your address is verified. If you didn't create this account, ignore this email.</p>`
      },
      generateEmailSubject: () => 'Verify your email — ARES Lesson Plans',
    },
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'roles'],
    group: 'People',
    hidden: ({ user }) => !canManageUsers(user as User),
  },
  access: {
    admin: adminPanelAccess,
    read: usersCollectionRead,
    // Open self-registration or Site-Admin people management — policy + rationale live with
    // their read/update siblings in access/index.ts (usersCollectionCreate, 2026-07-09).
    create: usersCollectionCreate,
    update: usersCollectionUpdate,
    delete: siteAdminOnly,
  },
  hooks: {
    // Throttle the unauthenticated auth surface (SPEC §11 "generation, auth"): login and
    // forgot-password budgets, per target identifier + site-global. See hooks/authRateLimit.
    beforeOperation: [rateLimitAuthOperations],
    beforeChange: [grantSiteAdminToFirstUser, guardPasswordChange, enforceAssignmentScope],
    afterChange: [autoDemotePriorSubjectAdmins],
    // A user's favorites and messages are personal rows with NOT NULL user FKs — cascade them, or
    // the delete 23502s (same shape as the lesson-plan cascades). See collections/Favorites and
    // collections/Messages.
    beforeDelete: [cascadeDeleteUserFavorites, cascadeDeleteUserMessages],
  },
  endpoints: [
    // Narrow, freshness-guarded Editor grant/removal for the Manage Editors widget — replaces the
    // widget's full-array PATCH (lost-update hazard on authorization data). See endpoints/userAssignments.
    assignEditorEndpoint,
    unassignEditorEndpoint,
    // Shadows Payload's native POST /forgot-password so the response cannot differ between a
    // registered and an unknown address (L3-R1). Delivery moves to the retrying job below.
    forgotPasswordQueuedEndpoint,
    // SHADOWS the native POST /verify/:id (custom endpoints match first) to add the site-global
    // rate cap the native op has no hook seam for. See endpoints/verifyEmail.
    verifyEmailThrottledEndpoint,
  ],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Display name',
      admin: { description: 'Shown for attribution. Non-site-admins never see other emails.' },
      access: { update: selfOrSiteAdminField },
    },
    {
      // Override the auth-provided email field to add field-level read privacy (SPEC §8).
      name: 'email',
      type: 'email',
      access: {
        read: emailReadAccess,
        // Site-Admin-only since email verification (Codex 2026-07-10): Payload verifies only on
        // CREATE — an update neither clears `_verified` nor mints a token, so a self-service
        // change would let a verified account claim any unregistered address without proving
        // ownership. Changing an address is a Site-Admin action until a re-verify flow exists.
        update: siteAdminField,
      },
    },
    {
      // Override auth.verify's `_verified` base field: Payload's default gives EVERY authenticated
      // user create/read/update on it (defaultAccess, verified in installed
      // auth/baseFields/verification.js). Open registration made the create axis load-bearing
      // (same lesson as `roles` below, 2026-07-09): a signup body carrying `_verified: true` must
      // strip, or verification is self-service. The verify op itself writes via db.updateOne and
      // registerFirstUser via overrideAccess, so neither is affected by this gate.
      name: '_verified',
      type: 'checkbox',
      access: {
        create: siteAdminField,
        read: emailReadAccess, // self or Site Admin — verification status is personal, like email
        update: siteAdminField, // manual verify = Site-Admin repair action
      },
    },
    {
      // Override auth.verify's `_verificationToken` base field ONLY to index it (Codex
      // 2026-07-10): the public verify endpoint looks a token up per request, and without an
      // index every bogus token scans the users table. Base access (create/update: () => false),
      // hidden, and the token-clearing hook all survive the merge — this adds one key.
      name: '_verificationToken',
      type: 'text',
      index: true,
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: [{ label: 'Site Administrator', value: 'siteAdmin' }],
      defaultValue: [],
      saveToJWT: true,
      admin: {
        description: 'Global Site Administrator grant. Leave empty for non-admins.',
      },
      access: {
        // Only site admins may grant/revoke the global admin role. `create` matters since open
        // registration (2026-07-09): the collection create gate no longer implies a trusted
        // caller, so a signup body's `roles` must strip here (first-user bootstrap still works —
        // grantSiteAdminToFirstUser runs AFTER the strip). System paths bypass via overrideAccess.
        create: siteAdminField,
        read: siteAdminField,
        update: siteAdminField,
      },
    },
    {
      name: 'assignments',
      type: 'array',
      label: 'Subject-grade roles',
      labels: { singular: 'Assignment', plural: 'Assignments' },
      admin: {
        description:
          'Per subject-grade grants. Subject Admins may manage only their own subject-grades.',
      },
      access: {
        // Grants are not public: with the names-only roster relaxation (SPEC §8, 2026-07-02) the
        // collection read gate no longer hides them, so the field guard must.
        read: assignmentsReadField,
        // Like `roles` above: open registration makes the create axis load-bearing too.
        create: assignmentsUpdateField,
        // Entry gate; enforceAssignmentScope constrains which rows a subject admin may change.
        update: assignmentsUpdateField,
      },
      fields: [
        {
          name: 'subjectGrade',
          type: 'relationship',
          relationTo: 'subject-grades',
          required: true,
        },
        {
          name: 'role',
          type: 'select',
          required: true,
          options: [
            { label: 'Subject Administrator', value: 'subjectAdmin' },
            { label: 'Editor', value: 'editor' },
          ],
        },
      ],
    },
  ],
}
