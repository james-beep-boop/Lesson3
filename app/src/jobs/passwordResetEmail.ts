/**
 * Queued password-reset email (audit 2026-07-20, L3-R1).
 *
 * WHY THIS EXISTS — it is a SECURITY fix, not a reliability nicety. Payload's native
 * forgot-password sends inline, and that send is what leaked account existence. **The full proof
 * lives in the `endpoints/forgotPassword.ts` header — deliberately not restated here, so there is
 * one copy to keep in step with Payload's internals.** Moving delivery OFF the request path is what
 * lets that endpoint answer identically for both branches; because this job retries, the
 * "a reset link is on its way" message is also TRUE rather than merely uniform.
 *
 * What this module owns, and what is documented nowhere else, is below: why the input is a user id
 * rather than the token, and why a token that is still PRESENT may nonetheless be dead.
 *
 * THE INPUT IS A USER ID, NEVER THE TOKEN. Successful jobs are removed (Payload's
 * `deleteJobOnComplete` defaults to true and we do not override it — verified empirically: the row
 * exists immediately after enqueue and is gone once autoRun processes it). But a job that EXHAUSTS
 * its retries is retained for diagnosis — and that is exactly the SMTP-outage case this task exists
 * to survive. A token in the input would therefore persist a live password-reset credential in
 * `payload_jobs` precisely when delivery was failing. The handler instead reads the CURRENT
 * `resetPasswordToken` off the user row at send time — the one place that token already lives by
 * design — so no second copy is created under any outcome.
 *
 * Precisely: consuming a reset does NOT erase the stored token. Installed `resetPassword.js` sets
 * `resetPasswordExpiration = now` (line 63) and leaves `resetPasswordToken` in place, so the value
 * persists but is dead. That is why the handler below checks the EXPIRATION rather than trusting the
 * token's presence — a used token is still readable, and emailing it again would send a dead link.
 *
 * A consequence worth knowing: if a second reset is requested before this job runs, the token has
 * rotated and this job sends the NEWEST link. That is correct — the newest link is the one that
 * works — and both emails then carry the same valid token.
 */
import type { TaskConfig } from 'payload'

import { emailLinkBase } from '../lib/emailLinkBase'

export type PasswordResetEmailInput = {
  /** The user to email. Deliberately NOT the token — see the module header. */
  userId: number
}

export const PASSWORD_RESET_EMAIL_SLUG = 'passwordResetEmail' as const

export const passwordResetEmailTask: TaskConfig<{
  input: PasswordResetEmailInput
  output: object
}> = {
  slug: PASSWORD_RESET_EMAIL_SLUG,
  // Retries are the point: they are what makes "a reset link is on its way" honest across a
  // transient SMTP blip. (Contrast `emailVersionArtifact`, which is `retries: 0` because a user is
  // watching that request and can simply click again.)
  retries: 3,
  inputSchema: [{ name: 'userId', type: 'number', required: true }],
  handler: async ({ input, req }) => {
    const { userId } = input

    // `showHiddenFields` — `resetPasswordToken` is a hidden auth field, so a normal read omits it.
    const user = (await req.payload.findByID({
      collection: 'users',
      id: userId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as { email?: string; resetPasswordToken?: string | null; resetPasswordExpiration?: string | null }

    // No live token means the reset was already used, superseded, or expired between enqueue and
    // run. Nothing to send, and NOT a failure — returning normally avoids a pointless retry storm.
    if (!user?.email || !user.resetPasswordToken) return { output: {} }
    if (user.resetPasswordExpiration && Date.parse(user.resetPasswordExpiration) <= Date.now()) {
      return { output: {} }
    }

    // Same link target and copy as the former inline `Users.auth.forgotPassword.generateEmailHTML`:
    // the FRONTEND reset page, because /admin/reset bounces non-admins off the gated panel.
    const url = `${emailLinkBase()}/reset-password?token=${user.resetPasswordToken}`
    await req.payload.sendEmail({
      to: user.email,
      subject: 'Reset your password — ARES Lesson Plans',
      html: `<p>You requested a password reset for ARES Lesson Plans.</p>
<p><a href="${url}">Reset your password</a> (or paste this link): ${url}</p>
<p>If you didn't request this, ignore this email.</p>`,
    })
    return { output: {} }
  },
}
