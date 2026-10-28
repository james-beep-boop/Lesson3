# Source-only review / correction

**Addendum (original-author correction)**

The sentence "My greps for a subject length cap ... returned no usable output" is incorrect and should be disregarded. I was launched with `--tools ''` and `--no-session-persistence`, and the metadata records a single tool-free turn. I ran no greps or searches and executed nothing. Any statement about a missing subject length cap came from reading the provided source text alone. It is source-only inference, not executed evidence.

**Scope:** my review covers the supplied source text only. I did not execute, query, or reproduce anything.

**Coordinator results (not mine):** the coordinator independently checked the schema and Subjects source. They also reproduced two behaviors over real HTTP:
- A 201-character subject: preview returned 409 (offered), then approval returned 400 with no subject written.
- A native auth secret PATCH returned 200 with all four values unchanged.

**Findings are unchanged:** the first remains a Low-severity consistency mismatch, and the takeover hypothesis remains rejected. A baseline-specific reproduction may assert the preview 409 as its stated precondition. It is not meant to test every possible later remediation. No fixes are proposed.
