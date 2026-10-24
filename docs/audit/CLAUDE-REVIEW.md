# Claude review request — initial audit candidates and architecture proposals

Review this package independently. Do not implement fixes or expand into a full new audit yet.

## Revision and reading order

- **Product source baseline:** `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`.
- **Review package branch:** `audit/2026-10-24-review`. Record the fetched package commit with
  `git rev-parse HEAD`; the audit documents/helpers were added after the product baseline.
- Start with `AGENTS.md`, `CLAUDE.md`, and relevant SPEC sections (§2, §5, §6, §8 and §11).
  Read only the cited DECISIONS entries rather than its entire history.
- Review [the two findings](findings/C22-rbac.md): **F-C22-001** and **F-C22-002**.
- Review [the improvement assessment](IMPROVEMENTS.md): **I-C84-001** and **I-C84-002**.
- Supporting outcomes and limits: [C22 framework report](C22-framework.md),
  [expected policy](scans/rbac-expected.md), [implemented guards](scans/rbac-implemented.md),
  and [audit harness instructions](tools/README.md).

Open the relevant application source, callers, tests and installed **Payload 3.91.0** source yourself.
The package changes no product source, dependency, vendor file or existing test; new reproduction
helpers live under `app/tests/audit/`. Do not substitute recollection of another Payload version.

## Questions to challenge

### F-C22-001 — Teacher mutation of system job statistics

Check whether the generated global inherits authenticated update access despite the explicit native
job lockdown, whether a Teacher write should be forbidden under current policy, and whether the
reported persistence/repro establishes the claim. Evaluate severity independently. Distinguish direct
metadata mutation, the installed-function scheduling consequences and an actual live scheduler
outage. Existing queued work, schedule guards and metadata rewrites are material counterevidence.
The full live outage was not induced; no invalid/future schedule was written to the running target.
Challenge the proposed configuration seam and confirm that trusted scheduling writes would survive.

### F-C22-002 — Forged holder in a native editing lock

Check ownership and target-editing authority, the legitimate peer-owner browser control, and whether
the observed false warning is a defect or intended native behavior under the application's policy.
The dialog offers takeover; content is immutable/save-as-new. No data loss, lasting lockout or holder
email disclosure was demonstrated. Challenge the Low rating and whether a fix would break legitimate
takeover, bulk operations or trusted framework writes.

### I-C84-001 and I-C84-002

Assess whether an explicit generated-surface policy/contract adds justified clarity without a generic
policy engine, and whether preserving the paired form-render grant/immutable-write rejection is
better than the concrete alternatives described. Challenge costs, configuration lifecycle assumptions,
test coverage and migration risks. These are opening drafts, not a completed architecture review.

## Evidence discipline and runtime scope

Both findings are **candidates**. Their negative regression assertions remain red on the unfixed
baseline; neither is accepted or fixed. The framework batch reports 19 passed / one failed; the
separate lock UI negative case also fails after its positive control. Cleanup and native content
fingerprints are recorded in the reports. Do not convert these into an all-green or complete-audit claim.

Credentials, browser cookies, private target configuration, raw logs/traces and screenshots are not in
Git. Start with source/test review. If independently reproducing, establish your own C01-approved
disposable target and synthetic fixtures first, follow the private-mount/serialization requirements,
and preserve cleanup evidence. Existing shared/live stacks are not fixtures. Do not claim independent
runtime reproduction when only the author's report was available; state exactly what you verified
and which runtime check is still needed. No product edits, deployment, account changes or broader
fixture reset are requested by this review packet.

## Requested output

Write `docs/audit/reviews/claude-C22-and-C84.md`, recording package/source revisions and reviewer
model/date (keep account identities private). For each of the four IDs, give:

1. **Verdict:** confirm, amend, reject, insufficient-evidence or duplicate.
2. Source references and independently checked evidence; separate reported runtime results from
   your own reproduction.
3. Policy interpretation, severity/benefit assessment, counterevidence and limits.
4. Required corrections or smallest useful additional test, and critique of the proposed remedy.

Keep proposed product-policy changes distinct from implementation bugs. Preserve the original
findings/proposals; Codex will recheck objections and write the author response before acceptance.
Do not mark findings accepted or implement fixes in this review pass. Record any new lead separately.
This is the targeted opposite-family critique, not the independent blind C82 missing-issue pass.
