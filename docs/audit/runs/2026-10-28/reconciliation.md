# Coordinator reconciliation checkpoint

Fixed source `6e75a173e822e4c4be42821b0a4af48ca457bd36`. Stopped at the operator's request to preserve allowance and deliver the important results. This is a selective disposition record, not a blanket acceptance or rejection of every raw source-report candidate. Original reports remain preserved in source-reports/. Unmentioned leads remain unconfirmed.

## Confirmed versus speculative claims

Accepted findings have individual evidence/review files. For the first80 source packets the coordinator examined candidate statements and selected consequential callers. The following checks prevented false conclusions:

| Source packets / lead | Coordinator check and disposition |
|---|---|
| P001 empty taxonomy / P002 import confirmation | resolveTaxonomy trims and rejects an empty name. Production import and atomic development ingest have different contracts. `--yes` does not approve near-miss taxonomy automatically. No corresponding defect accepted. |
| P004–005 release/lineage | Manifest conflict rules require manifest identity. Backfill preserves existing lineage and parent closures; a claim that it erases deleted ancestors was not accepted. |
| P009/019/023 version mutation | Caller create is closed; the immutable beforeChange hook rejects authenticated updates, including the form-render access grant. Trusted migration/system calls require their own caller analysis. Generic Local API overrideAccess examples do not establish an HTTP bypass. |
| P010 read-marker claim | advanceReadMarker constrains the requested sequence to the topic's last_seq in the actual SQL update. A forged-ahead marker was not established. |
| P015 unchanged upload | Unchanged entries populate skipped; the endpoint counts that as a successful outcome. The proposed422 regression was rejected. |
| P017 Official locking | The current decision explicitly removed two pointer locks. The supplied interleaving deletes the specifically consented old version, not the newer Official. No extra-lock defect accepted. |
| P021/027 assignment provenance | Existing matching assignment signatures preserve provenance; duplicates do not demonstrate additional authority. No escalation accepted. |
| P024 uncertain posting | Author/submission-key uniqueness exists for topics and replies, with lookup-based client reconciliation. The real uncertain-reply browser control passes in both engines. |
| P025/033/039 summary title | SUMMARY_LESSON_PROSE contains observed/learned/explained, not title. The alleged title-permission leak was rejected. UNIT omission and null row members are separate reproduced findings. |
| P031/032 backup status | Destination kind is supplied by the real collector; malformed-record classification has explicit guards. A missing-caller or clock-rollback sketch is not a reproduced wrong status. |
| P034/059 network result | Actual fetch exceptions have a separate indeterminate-response path; arbitrary synthetic status0 is not the ordinary HTTP path. The literal restore-marker problem is separately confirmed. |
| P035 reference/privacy | Reference resolution preserves an entry, including null, per source post; general display-name read access is intended. Foreign email exposure was not inferred from names. |
| P037/038 recovery fencing | Database constraints and CAS retirement provide the actual boundary. Approximate active-capture counts are a recorded tradeoff, not an exact quota guarantee. |
| P040 dates | LocalDay uses separate server/client snapshots. Other formatDay callers are server strings or post-fetch/event rendering; no hydration defect accepted from the generic helper alone. |
| P041 client identity | The actual client tracker normalizes dotted IPv4-mapped addresses before keying and walks trusted forwarding headers. More unusual forms remain conditional, not an established remote bypass. |
| P042 orphan public version | Normal pointer/plan hooks close the claimed inconsistent relation. Damaged or trusted-SQL state is a separate precondition. Uppercase/noncanonical configured URLs remain unverified configuration edges. |
| P044 school-name length | Browser maxlength and server length both use UTF-16 units. No inconsistent emoji boundary was established. |
| P045 cache/system facts | Cache size is resolved at module evaluation. A later environment change cannot make its getter throw; actual probe resolves. Initial invalid module configuration and unexamined readers remain distinct. |
| P048 converter | Body timeout loses PdfConversionError: F-C42-002. Fixed attribution years and arbitrary adapter id/null examples do not by themselves establish valid-contract corruption. |
| P049/050 generator boundaries | Actual safePrefix and parseDeliverableTag callers validate before use. A generic object-property example is not a demonstrated endpoint path. |
| P051 unsaved-work warning | The bounded flush catches rejection; the proposed unconditional stuck-busy path omitted that catch. |
| P052/053 Manage | Subject-name field in one map is consumed only by the Site Administrator delete panel; scoped labels use stored labels. PANEL_IDS supplies canonical order after available-panel collection. |
| P058/060 registry/capture | Current captureAndReport callbacks are async and content is native JSON; hypothetical synchronous throwing callbacks, cyclic values or BigInt are not demonstrated native inputs. Empty registry safety is relevant to the actual logout failure, separately qualified. |
| P066 save race | flushSync sets processing before validation/snapshot/await; the claimed ordinary late-keystroke path omitted the real form lock. |
| P069/070 account actions | Role-conflict response explicitly instructs reload; no automatic-refresh promise was found. Remove-control availability uses full control, not handover-only authority. |
| P074/077 modal/hydration | Modal deliberately renders null until its useSyncExternalStore hydration snapshot changes. A parent deciding to render Modal on hydration does not itself prove a DOM mismatch. Stacked-modal behavior still needs a reachable simultaneous caller. |
| P076 upload confirmation | Actual409 includes report.missing, including an empty array, so a mocked omission does not establish unreachable Official confirmation. |
| P079 catalogue documents | DocStrip's condensed branch applies secondaryDeliverables, so the claimed duplicate primary buttons were rejected. |
| P080 public/forgot/forum | requirePublicLibrary is synchronous, so missing await is not a bypass. Forgot-password budgets use requested identifiers before account lookup. requireForum restricts disabled-forum reading to Site Administrators; its moderator wording is not shown to every teacher. |

## Clean-result sampling and limits

Selection was deliberately boundary-oriented: immutable native writes and unchanged-row checks; caller-scoped email reads; parser non-execution; monotonic discussion markers; idempotent uncertain posting; renderer stored text; and the previous-release upgrade. These checks include scenarios expected to pass, not only attempts to reproduce claimed bugs. Source clean claims were challenged against actual consumers, including panel ordering, condensed document filtering and synchronous public access guards. This is a judgment sample, not a random or statistically representative proof of all clean reports.

Open raw leads include transient/stale UI behavior, out-of-range pagination, exceptional taxonomy loads, account profile concurrency, uncommon URL/configuration forms and several untested browser timing claims. They are not accepted findings. Reports afterP080 have not received a complete coordinator candidate disposition. Whole-component completeness must not be inferred from successful runtime suites or author-read ranges.
