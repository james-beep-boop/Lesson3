# First-wave evidence — partial C21/C22/C31/C41

Contract: run bounded probes on the isolated production-mode stack; assert stored state in addition to denial responses; distinguish expected policy from implementation. These probes supplement, not replace, the full catalog matrices.

A standalone probe exercised 38 checks across six caller shapes: Teacher, Teacher with editing access in this subject-grade, Subject-grade administrator, Site administrator, editing access in another subject-grade, and mixed capabilities. An unverified account could not sign in. Direct immutable-version PATCH returned 403 for all six and the trusted full row hash stayed unchanged; direct plan/version creation was denied. GET/POST GraphQL returned 404 for all six; anonymous retained-version read was denied.

Non-site-admin queries filtering the user roster by another user's hidden email returned 400 and no match/field disclosure. The Site administrator positive control returned the matching peer and email. See permission-probe.json.

The initial PATCH probe submitted only system-only fields and received Payload's empty-data 400 after stripping them. It was corrected to include a real prose change, then the six-role immutability/no-write checks passed. This was a probe-design correction, not a product change.

The DB-free malicious corpus checks dynamic JS/getters/computed keys/spread/template expressions, JSON prototype keys/malformed/scalar roots, bounded high-compression expansion, entry-count overflow, corrupt ZIPs and unsupported web extensions. A settled per-file extraction failure is replayed by item.extract, rather than being placed in prepareUploadFiles.rejected; the probe now tests that actual contract. Corpus results are recorded when the run exits successfully.

Full per-field/collection matrices, controlled race additions, UI role/route crawl and independent opposite-family review remain pending. No audit finding is confirmed by this baseline alone.

The two email-disabled endpoint controls later passed on the no-SMTP target: valid email-export request returns503, and public forgot-password submission preserves an administrator-issued token. Other cases were filtered out of this targeted repeat. Combined distinct baseline HTTP cases across modes:498. Raw no-email control log remains private.
