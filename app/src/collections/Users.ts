import type { CollectionConfig } from 'payload'
import type { User } from '../payload-types'

import {
  adminPanelAccess,
  assignmentsReadField,
  assignmentsUpdateField,
  canManageUsers,
  emailReadAccess,
  isSiteAdmin,
  selfOrSiteAdminField,
  siteAdminField,
  siteAdminOnly,
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
import { isHttpsServerUrl } from '../lib/publicPosture'
import { assignEditorEndpoint, unassignEditorEndpoint } from '../endpoints/userAssignments'
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
    // Build the reset link from ADMIN_URL (falling back to SERVER_URL). serverURL is
    // intentionally '' on the internal host (see payload.config.ts) so it can't be used
    // for the email base there.
    forgotPassword: {
      generateEmailHTML: (args) => {
        const token = (args as { token?: string } | undefined)?.token ?? ''
        const base = process.env.ADMIN_URL || process.env.SERVER_URL || ''
        // The FRONTEND reset page (2026-07-09) — /admin/reset would bounce non-admins off the
        // gated panel after resetting; the app page works for every role.
        const url = `${base}/reset-password?token=${token}`
        return `<p>You requested a password reset for the ARES Lesson Library.</p>
<p><a href="${url}">Reset your password</a> (or paste this link): ${url}</p>
<p>If you didn't request this, ignore this email.</p>`
      },
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
    // Open self-registration (user decision 2026-07-09, SPEC §8): anonymous visitors may create
    // an account (rate-capped in hooks/authRateLimit; privileged fields are create-gated below,
    // so a hostile signup body cannot smuggle roles/assignments). An AUTHENTICATED non-admin has
    // no business creating users — only Site Admins keep that (people management on Manage).
    create: ({ req }) => !req.user || isSiteAdmin(req.user as User),
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
        update: selfOrSiteAdminField,
      },
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
