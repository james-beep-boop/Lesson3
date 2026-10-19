# Phase 4 — proposed scope for approval

**Deferred until teacher use justifies it. Operator did not approve this scope (2026-10-19);
#412 is closed without merging. Keep Save → Combine. No phase 4 implementation is authorized.** The full blueprint in
[`DESIGN-update-draft-2026-10-19.md`](DESIGN-update-draft-2026-10-19.md) remains deferred. This proposal follows the operator's latest
order: #409 correction, ARES release ancestry/resource support (#410), Insert link tidy-up, then
phase 4 scope approval. No merge or deployment.

## Proposed outcome

Let a teacher bring an ordinary private draft together with a newer readable version without first
creating the intermediate numbered version used by today's Save → Combine workflow. Retain that
existing workflow as an available fallback. Nothing creates a numbered version automatically.

## Included

1. **Ordinary drafts only.** Current owner, current editing access, existing normally restorable
   source, same plan and a higher numeric target version. Stale-source/schema-mismatch drafts keep
   their current copy-only behavior. Do not update an unfinished Combine directly.
2. **Correct ancestry for ARES releases.** The target need not descend from the draft's source:
   teacher version 1.0.1 and ARES release 2.0.0 may both descend from release 1.0.0. Find the real
   common ancestor between saved source and target, then compare source-plus-private-overlay with
   target through the existing engine. Never use the teacher's source as the base merely because
   it owns the draft. Preserve row-correspondence, resource/admin ownership, size and ancestry guards.
3. **Explicit review.** Show the existing automatic-change/conflict review, with choices changeable
   until Save. Continue in editor switches to the engine-selected starting version and URL, as
   Combine does today. Require every conflict to be resolved before Save as new version. Saving
   creates Not Official and leaves Official unchanged; never deletes either parent.
4. **Resumable private work.** Preserve the original draft until the apply operation succeeds.
   Atomically write the engine-started working draft and retire the previous draft if its source
   changes. Do not overwrite an existing target draft. Revision/generation preconditions, operation
   identity and lost-response recovery must make retries safe. If the engine retains the original
   source, transform that row atomically under the same precondition instead of creating a duplicate.
5. **One Combine reducer first, within this feature.** Its states cover choosing/comparing/reviewing,
   applying, resolving, ready, retryable failure and unavailable source. Operation identities fence
   late responses. Derive Save eligibility and remaining choices once. Payload's form owns prose;
   recovery owns backup tokens. No standalone rewrite before the feature is approved.
6. **Failure rules.** Temporary errors keep provenance and offer retry. Source deletion removes the
   corresponding draft by the existing cascade; keep only the text already on screen for copying.
   Deleted and unreadable versions are indistinguishable. Recheck editing access before identifying
   an unavailable parent. A confirmed unavailable second parent can become ordinary only with the
   existing explanation. Keep endpoint-owned JSON responses, not APIError data. Before apply, the
   original source owns deletion; after a switch, the new editing source does. Retiring or deleting
   a draft clears its frozen input too. Automatic prose backup never depends on running the comparison
   or validating optional comparison metadata.

## Data and endpoint cost to approve deliberately

A changing working draft cannot reconstruct the original private comparison input on restore.
The design must retain bounded, owner-only input independently of the working prose. Recommend a
server-projected sparse original prose overlay, capped at the existing 512 KiB capture limit; never
a full bundle or administrator/system content. This could add up to 512 KiB per updating draft and
requires a migration and an explicit SPEC transient-overlay exception. The original proposal's
conflict-only alternative must prove sufficient for changed conflict choices and recomputation after
an engine update before replacing the complete overlay; do not assume it is sufficient.

Expect a read-only owner-authorized preview operation and an atomic apply operation, with bounded
resume support under the existing comparison rate limit. Reuse recovery/Combine services, not a
parallel save implementation. Approve exact field shapes, migration, endpoint contracts and all new
screen wording in the implementation design before building them. The scope approval alone does
not approve an unspecified migration or screen text.

Implementation would start from freshly fetched main after the preceding code PRs have merged
and the operator has approved the concrete design. No merge is authorized from this proposal.

## Proof required

- Reducer transitions, cancellation and stale-response fencing; real common-base selection for an
  unsaved draft on a teacher branch versus a newer ARES release; prose/resource and protected-field
  outcomes; resumption after choices and engine changes; bounds and clearing/retirement.
- Built-app wire authentication, current editing access and owner isolation; same-plan/target
  checks; revision conflicts; existing target draft; rollback; lost-response retry; deletion and
  revocation during lock waits; read-only preview and shared rate limiting.
- Browser review, URL/version switch, resumption, changeable conflict choices, retry/discard,
  existing-target handling, source deletion, no automatic numbered save, Not Official and unchanged
  Official. Existing Save → Combine still works. All required isolated gates on
  `lesson3-codex-probe`, port 3103; ready feature PR, no merge/deployment.

## Excluded

Stable row identity, structural/admin draft capture, updates of unfinished Combine drafts,
cross-plan or cross-school combinations, Standard/Advanced mode, connectivity/sync, Plan A+
rewriting and automatic deployment. No implication that the server verifies a teacher's prose is a
"correct" combination.

**Operator decision (2026-10-19):** not approved. Retain Save → Combine until teacher use
justifies the extra storage and transaction flow. The proposal above is preserved for that day.
