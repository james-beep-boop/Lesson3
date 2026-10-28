# Supplemental sealed review — coordinator reconciliation (in progress)

Read after the seal commit896c289c; original text stays unchanged. This is an addendum, not a rewritten blind report.

- F1: accepted as F-C31-001 after real HTTP/Postgres reproduction and original-author recheck; only UNIT omission is demonstrated.
- F2: amended to F-C71-002, a Low specification/enforcement ambiguity. Crafted admin saves alter the fields; no escalation is accepted and a policy decision remains.
- F3: duplicate of F-C40-001, independently reproducing the same trimmed-versus-stored identity mismatch. It is one finding, not two.
- F4: narrowed to F-C40-002, a Low preview/approval length mismatch; no live extreme-size attack or outage claim.
- Credential-takeover lead: rejected. Installed Payload3.92 native auth fields all deny create/update. A genuine Subject Administrator PATCH returned200 but a trusted hidden-field read proved token, expiration, salt and hash all unchanged. The original author accepted rejection.
- Prewarm transaction lead: the current `prewarmVersionArtifacts` explicitly calls `enqueueDetached` without request; the detached-job orphan/no-op trade is documented. The old ingest comment does not establish a transactional-job regression.
- `refreshCaller` lead: rejected. `caller` aliases `req.user`; authority is replaced in place, preserving request-only fields. It does not need to assign a new object to refresh the request.
- DROP_KEYS question: actual versionContent excludes ids, release provenance, semver, both parents, lineage, author and timestamps; server relationship keys are independently overwritten/excluded. Official-change stamps live on plans, not version content.
- Generated-surface question: built-config inventory includes KV, jobs, locks, preferences and disabled migrations. The new native read matrix checks these. Full write/owner-policy reconciliation still remains.

The supplemental strong review found the UNIT omission missed in the cheap source pass. The coordinator escalated review of that boundary, read its whole role split and save caller, and added real scoped-user write reproductions. Cheap author readings are not sufficient to mark integrity boundaries clean.
