# Stored no-op fields — post-audit follow-up

Source reviewed: `bd5f07863a150cd51245b9c942502efa19d4014d`; the relevant application source is
unchanged on main at `d28b6ef4ca00555219e9de042ae6363d85be6c11`.

The three fields in the policy question are `META.outputDir`, `LESSONS[].substrand`, and
`LESSONS[].aresKeywords` (stored as `meta.outputDir` and `lessons[].{substrand,aresKeywords}`).
SPEC §5 says they are faithfully stored upstream data and never editable by anyone. They are hidden
and read-only in the form via `storedNotEdited` in `fields/lessonContent.ts`; that is presentation
only. Field-level access must not be added: Payload nulls optional fields within submitted arrays,
which is why write-time preservation belongs in the field-split hook.

`applyEditorFieldSplit` restores fields outside the prose whitelist for a Teacher with editing
access, but returns early for Site Administrators and, after preserving only the distinct META
identity keys, Subject Administrators. The save-as-new endpoint passes submitted content through
this helper before its trusted create. This does not permit in-place mutation of an immutable version.

A DB-free probe executed the current helper with an original containing `outputDir=original-output`,
`substrand=original-substrand`, and `aresKeywords=original-keywords`, and submitted `changed-*` values.
Both a Site Administrator and an in-scope Subject Administrator retained all three submitted values
in the helper output. This confirms the helper behavior and source mismatch; it is not a new wire-
level reproduction or an additional accepted security finding.

Recommendation: preserve these three values from the source on every human save, including
administrator saves, while permitting trusted ingest/re-ingest to supply upstream values. Keep the
existing META identity repair permission (`subject`, `grade`, `substrand_id`) separate. Define the
behavior for newly added lesson rows and pin save-as-new/Combine/preview parity before implementing
that change. No policy or product behavior was changed in this follow-up.
