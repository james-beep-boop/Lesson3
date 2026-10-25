# Lesson3 v1.07 audit summary

This audit covers the product source at `bd5f07863a150cd51245b9c942502efa19d4014d`, which matches
the v1.07 tag `69dd7d2ec1f3d8b9e78bff8c7f0892cdf41a2234`. The branch contains audit documentation
only; no product fix was implemented. The operator authorized a sole Codex auditor, audit-only scope,
Spark execution, synthetic data, and GitHub publication. Independent Claude review was waived by
direct instruction and is not claimed.

Four findings are accepted: two Medium and two Low. Three authentication findings were known and
deferred before this audit; the restore-cache finding is new to this pass.

| Priority | Finding | Severity | Practical impact |
|---|---|---|---|
| P1 | [F-C23-001](findings/C23-auth-current.md) shared sign-in budget exhaustion | Medium | A distinct-address burst blocks valid teacher and administrator sign-ins until the shared budget recovers. Existing sessions and reset budget remain available. |
| P2 | [F-C23-002](findings/C23-auth-current.md) targeted account budget exhaustion | Low | A victim-address burst blocks that account's login; it requires the victim address and does not expose an existing session. |
| P2 | [F-C23-003](findings/C23-auth-current.md) login account enumeration | Low | Paired timing and the locked-account message reveal registration state, not credentials. |
| P1 | [F-C70-001](findings/C70-ops.md) restore cache-deletion errors are masked | Medium | A deletion fault is reported as success and a retained readable cache entry can survive the restore. A wrong-old-document collision was not established. |

The findings were reproduced on isolated production builds with synthetic fixtures and independently
rechecked against current source and controls. Shared deployment revision, edge identity/limits, and
delivery parity were not available; those are qualified limitations rather than silent assumptions.

## Evidence completed

- Baseline lint, types, format, **1,867 unit tests**, **339 integration tests**, production/migration
  builds, and current HTTP suites passed as recorded in [C00](C00-baseline-current.md) and
  [C5 endpoints](C5-endpoints-full-current.md).
- The 888-file manifest and 43-chunk register are maintained in [manifest-current.md](manifest-current.md)
  and [progress.md](progress.md). Generated schema snapshots are excluded only where the catalog
  explicitly requires provenance review.
- The isolated target was reset/reseeded/restored with eight verified role logins, unverified-user
  refusal, captured reset mail, and serialized live probes ([C01](C01-current-target.md)).
- Authorization core: 21 focused units and 26 access integration assertions passed
  ([C51](C51-authorization-current.md)). Fields/editor grammar passed 112/112
  ([C512](C512-fields-current.md)); config/wiring passed 73/73 plus the App Router check
  ([C513](C513-config-current.md)).
- The 36 hand-authored migrations were reviewed and the older-schema full-stack upgrade/interrupt/
  restore drill passed 104/104 ([C514](C514-migrations-current.md)).
- Current C31 save/authority/recovery/Combine/deletion evidence includes the persisted deletion ledger
  with equal before/after fingerprints; the reliable two-writer Official race remains open by design.
- C40/C41 upload/parser evidence covers 54 synthetic files, 35 wire requests, 29 extractor cases,
  body ceilings, monitored expansion, PostgreSQL rollback, preview, DOCX/PDF, and Mailpit sink checks.
- Visual coverage includes style/menu/dialog probes and an 84-entry four-role × seven-route ×
  three-width matrix with no horizontal overflow ([C60](C60-visual-current.md)).
- Accessibility coverage includes a 28-page axe matrix with zero violations; nine tool-incomplete
  color-contrast checks are retained for manual review ([C61](C61-a11y-current.md)).
- Performance probe: two 15-second, four-worker runs completed 12,676 requests without errors;
  measured latency/resource observations and tool limits are in [C62](C62-performance-current.md).
- Functional browser coverage: 142 Chromium passes (two SMTP-fixture expectation mismatches and one
  skip) plus 11/11 WebKit passes; reconciliation is in [C63](C63-functional-current.md).
- Documentation parity: 103/103 guide, environment, backup-path, public-posture and generated-surface
  assertions passed ([C71](C71-docs-drift-current.md)).
- Cross-cutting endpoint, role/action, invariant/test and environment matrices are in
  [scans/matrices.md](scans/matrices.md); five vertical flows are traced in [C81](C81-vertical-flows.md).

## Qualified gaps

The audit is complete as a documented, qualified assessment, not a claim of universal deployment
coverage. The remaining limits are explicit:

- deployed/shared-edge parity, proxy identity and Cloudflare cache behavior;
- Lighthouse/mobile throttling, long saturation curves, and a production Gotenberg/cache topology;
- full REST field permutation and every custom endpoint's formal 401/403/404/happy-path cell;
- keyboard-only/screen-reader walkthroughs and manual contrast sampling of the non-BMP favorite glyph;
- linkinator, expiry-mid-edit, cross-device recovery, and a reliable concurrent Official/Combine race;
- unavailable static tools (knip, jscpd, gitleaks, shellcheck, hadolint, stylelint, coverage provider)
  and historical backup shapes outside the representative upgrade drill.

These are follow-up work items, not accepted findings. The matrix and progress register distinguish
each unrun or environment-specific check from covered evidence.

## Fix roadmap

1. Redesign shared and targeted authentication budgets so a low-cost distributed burst cannot deny
   legitimate sign-in; retain bounded hash work, trusted proxy identity, and recovery isolation.
2. Normalize public failure/hash behavior for account-enumeration resistance without weakening reset
   and verification flows.
3. Make restore cache deletion fail closed, record the failed operation in the journal, and verify
   cache/database identity before serving restored artifacts.
4. Promote the strongest invariant tests (immutability wiring, AST execution sentinels, no-SMTP
   branches, restore interruption/resume, and deletion fingerprints) into required CI checks.
5. On the next deployment, repeat C70/C62 edge and resource checks, then close the qualified browser,
   static-tool, and concurrent-race gaps.

Rotate all synthetic audit account passwords and remove the disposable Mailpit/target stack after
the branch has been reviewed.

Post-audit follow-up: this audit's marked disposable stack, Mailpit, synthetic account database, and
cache volumes have now been removed after verifying namespace, configuration digest, and database
ownership marker. Private evidence is retained. [PR #457](https://github.com/james-beep-boop/Lesson3/pull/457)
proposes the restore-cache fix separately from this unmerged audit branch. The three stored no-op
fields and the administrator helper behavior are detailed in [C21 follow-up](C21-stored-fields-followup.md).
