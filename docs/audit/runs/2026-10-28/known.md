# Prior decisions and known limitations used by this run

Read current/relevant decisions rather than treating every historical paragraph as current policy. Source baseline is fixed at6e75a173; later main changes through the last recorded sweep are audit/release documentation only.

- Parts1–3 and the3b cleanup are merged. Physical amd64 stick/install/commissioning work is future work, not code claimed tested by this audit.
- Generator libraries and attribution config have separate current provenance pins. Copyright wording changed after older oracles; strict gates remain failed in this run, with a separately qualified comparison. No oracle was edited.
- Native timeout/screen-loss risk was historically L3-13 and later described as addressed. F-C63-004 is baseline counter-evidence to that resolved claim; do not describe the general risk as newly discovered.
- Authenticated version updates are intentionally always refused despite a form-render access grant. Trusted migration/system writes without a user are documented exceptions, not missing auth by themselves.
- Non-Official deletion, source retention and scoped grants follow current SPEC; all versions are not private author-only records. Narrow UI links are not an authorization boundary.
- Two Official-pointer locks were deliberately removed by the14 August decision; the delete-side lock remains. An extra lock needs a concrete failing interleaving rather than a superficially similar read/write sequence.
- Supported production import and atomic development ingest are different tools/contracts. Early source-packet briefing omitted that distinction; those policy conclusions were not accepted.
- Capture guarantees only the last confirmed server capture. This does not erase the separate requirement to leave unsafe work readable when the final flush is unconfirmed.
- Approximate active-capture caps, frozen fingerprint normalization, advanced-tool display gating, URI grammar and shared-machine storage restrictions are deliberate constraints. Do not alter them during this audit.
- Message-length policy remains the operator's decision; this audit changes neither limit nor summary behavior.
- No deployment, release, new tag or implementation fixes are authorized by the audit. Existing private evidence and unrelated stacks are preserved.
