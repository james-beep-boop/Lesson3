# Correctness audit progress

Source: `6e75a173e822e4c4be42821b0a4af48ca457bd36`. Audit-only.

**Stopped early at the operator’s request to conserve allowance.** The table preserves the actual chunk state; in-progress/pending work remains unfinished. Final checkpoint: REPORT.md.

| Chunk | Status | Evidence / next action |
|---|---|---|
| C00 | baseline recorded | scans/baseline.md; failures/gaps retained explicitly. |
| C01 | local target proof complete | scans/reset-drill.md; private snapshot/reset/login and foreign-lock negative control passed |
| C10 | in progress | scans executed; coverage/remaining inventory tasks pending |
| C11 | partial | scans/dependencies.md plus release-age/override tables; container/action freshness and removal experiments unfinished. |
| C12 | partial | scans/static-triage.md; Knip controls/sample triage complete, per-symbol reconciliation unfinished. |
| C13 | partial | strict lint and19 duplication clusters classified; no automatic correctness inference. |
| C14 | partial | CSS scans, all four duplicate selectors inspected; full cascade coverage unfinished. |
| C15 | in progress | history scan hits inspected as false positives; shell/Docker triage pending |
| C20 | in progress | registered-surface inventory and partial browser crawl recorded |
| C21 | in progress | six-role supplemental cases; complete expected matrix pending |
| C22 | in progress | 498 distinct HTTP cases across suitable SMTP modes plus 38 supplemental checks; full matrix reconciliation pending |
| C23 | in progress | native read matrix rejects unverified sessions; whitespace-password edge reviewed; native16-check mail/reset/session/CSRF journey passed; additional edge reconciliation pending |
| C24 | in progress | native privacy/unchanged-row baseline plus two-engine stored-text sample; complete IDOR/moderation/recovery reconciliation pending |
| C30 | in progress | scans/version-write-paths.md and AST literal/dynamic call inventory; remaining SQL/script reconciliation explicit |
| C31 | in progress | F-C31-001 confirmed after scoped HTTP save; original snapshots unchanged; full boundary reconciliation pending |
| C40 | in progress | F-C40-001 reproduced and independently rechecked; source-group reconciliation pending |
| C41 | in progress | 16 bounded malicious-input checks passed; remaining live corpus cases pending |
| C42 | in progress | three qualified DOCX sample comparisons; strict oracle mismatch retained;24 actual conversions/220 paired pages plus native export race investigated |
| C5.1 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.2 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.3 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.4 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.5 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.6a/b… | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.7 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.8 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.9a/b/c | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.10 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.11a–f | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.12 | in progress | bounded source-author ranges returned; strong boundary/caller reconciliation remains distinct from reads |
| C5.13 | pending | Not yet assessed. |
| C5.14 | representative upgrade passed | scans/upgrade.md; v1.10→baseline,33 tables unchanged,7 old/12 new native checks; broader historical/hardware limits explicit |
| C60 | in progress | 84 route/role/viewport combinations per engine; three manual samples and Chromium keyboard journey recorded; all dynamic states not covered |
| C61 | in progress | zero selected axe violations in those states; expanded four-tag axe crawl passed; WebKit keyboard/full-state gaps remain |
| C62 | in progress | bounded12-case read load and five authenticated mobile Lighthouse pages measured; corpus/saturation/deployment limits explicit |
| C63 | in progress | browser baseline and audit rechecks recorded; F-C63-003/004 reproduce expiry losses with controls and independent critique; navigation/keyboard limits explicit |
| C70 | pending | Not yet assessed. |
| C71 | in progress | two documentation ambiguities reviewed; full docs drift pass pending |
| C72 | in progress | title-search fixture dependency reproduced and reviewed; broader quality review pending |
| C80 | partial |17 accepted scenarios, review records and selective reconciliation; remaining raw leads unconfirmed. |
| C81 | pending | Not yet assessed. |
| C82 | qualified supplemental pass sealed | blind-seal.md records SHA-256 before comparison; late timing/model deviation means strict C82 remains unmet |
| C83 | partial checkpoint delivered | REPORT.md; final fetched main e9d38195, product paths unchanged. Whole-catalog work incomplete. |
