import type { CollectionConfig } from 'payload'
import type { User } from '../payload-types'

import {
  adminPanelAccess,
  assignmentsUpdateField,
  canManageUsers,
  emailReadAccess,
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
    // 15-minute inactivity window. With admin.autoRefresh off (the default), the admin
    // shows a "Stay logged in?" prompt ~1 min before expiry and force-logs-out at expiry
    // if unattended — so a walked-away session (even with the tab open) clears itself.
    // Active editors get one prompt per window; explicit Log Out is immediate.
    tokenExpiration: 900,
    // Build the reset link from ADMIN_URL (falling back to SERVER_URL). serverURL is
    // intentionally '' on the internal host (see payload.config.ts) so it can't be used
    // for the email base there.
    forgotPassword: {
      generateEmailHTML: (args) => {
        const token = (args as { token?: string } | undefined)?.token ?? ''
        const base = process.env.ADMIN_URL || process.env.SERVER_URL || ''
        const url = `${base}/admin/reset/${token}`
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
    create: siteAdminOnly,
    update: usersCollectionUpdate,
    delete: siteAdminOnly,
  },
  hooks: {
    beforeChange: [grantSiteAdminToFirstUser, guardPasswordChange, enforceAssignmentScope],
    afterChange: [autoDemotePriorSubjectAdmins],
  },
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
        // Only site admins may grant/revoke the global admin role.
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
