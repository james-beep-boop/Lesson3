# Fidelity evidence — C42/C5.8 partial

Contract: preserve pristine generator bytes, use pinned upstream inputs/oracles and report exact differences. Do not change golden files or comparison rules to obtain a green result.

All four vendored library files were independently matched against upstream commit f83db61931566df6bde9252db552bd353ed43d7a. The application provenance unit gate also passed in the baseline unit suite. The separate config revision is d3d2b875d5a2e6e6ad2409f900a4df06fd245c3e. Its library build_docs.js has an unrelated CLI output-directory change; that newer library was not substituted into the app.

Stock Physics content gate: 1/5 passed. Stock adapter gate: 3/7 passed. The document text mismatches name ARES in the committed upstream DOCX copyright and ARES Education in the approved current runtime configuration. These remain failed stock gates; no golden file or existing test was changed.

A separate diagnostic compared all ordered blocks for Physics 4.1, Essential Mathematics Indices and Mathematics Trigonometry I, accounting only for the existing oracle-only partial-match note exclusion and the approved exact copyright wording change. No remaining block mismatches appeared across the twelve documents. Section-C layout/package/hyperlink checks passed for all three lesson sequences. This is qualified diagnostic evidence, not a replacement strict fidelity pass. Generated documents and raw logs stay outside the repository.

PDF page-image/text comparison, concurrent export load and fresh authoritative oracles matching approved attribution remain pending.
