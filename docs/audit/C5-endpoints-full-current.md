# Current full endpoints HTTP suite

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The complete current `app/tests/http/endpoints.http.spec.ts` suite passed **122 of 124 tests** in
18.02 seconds (exit 0) against the marked target; the two skipped cases are the explicitly
no-SMTP complements because this target has Mailpit configured. The pass covered GraphQL/public
resource posture, document CSP and security headers, stored/unsaved preview and Preview-as-PDF,
DOCX/PDF and AReS export, version/plan creation guards, save-as-new field and freshness boundaries,
source retirement and Make Official, role assignment, email and messaging gates, open signup and
verification, request-editing, mark-read, forgot-password uniformity, and upload/taxonomy behavior.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c5-c40-endpoints-full-current.log`.

The two skipped complements were then run against the same production image in a replacement app
container on the marked network with `SMTP_HOST` empty, under the target lock. The selected
`-t 'without SMTP'` run passed **2/2** cases in 3.22 seconds: valid email-a-doc returned `503`, and
public forgot-password preserved an existing administrator-issued reset token. The private
orchestration script was executed from the exact pre-run copy hashed
`52adefe5befe03eee842461fd5823b0e50fe5c0b59a0327df545832adb430215`; its copy and raw output are
retained outside Git at `private/provenance/c5-no-smtp-run.executed.sh` and
`logs/c5-no-smtp-complements-locked.log`. The normal Mailpit app was restored and the target lock
released.

This is current full-file wire evidence plus both named no-SMTP complements. It does not close the
broader source-review, browser, public-proxy, deployment-parity or remaining C40/C41 catalog.
