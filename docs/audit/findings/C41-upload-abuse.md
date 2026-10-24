# C41 — Upload-abuse candidates

Baseline: `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`. Coverage and the full corpus table are in
[C41-upload-abuse.md](../C41-upload-abuse.md).

**No new candidates.** The one real gate miss, F-C40-001 (built-in-named keys bypass the contract
gate), was reproduced over HTTP here and is filed in
[findings/C40-ingest-code.md](C40-ingest-code.md). Everything else in the corpus was refused or
handled as policy intends. One cosmetic lead (L-C41-01, raw error text for a deeply nested file) is
in the report, not filed as a defect.
