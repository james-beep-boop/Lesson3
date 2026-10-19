# Gotenberg 8.38 maintenance review — 2026-10-19

Scope: update the PDF conversion images only, from Gotenberg 8.37.0 to 8.38.0. The operator approved
this separate maintenance PR after #413 merged. No merge or deployment is authorized.

## Selected images

| Use | Version | Multi-architecture index digest |
| --- | --- | --- |
| Custom image with Arial (`gotenberg/Dockerfile`) | 8.38.0 | `sha256:c36cdd730893e3941d27a196ff8b68675e473642d067ec7ee3668b9adaa37b75` |
| Local-server release bundle (`deploy/online/compose.template.yaml`) | 8.38.0-libreoffice | `sha256:1fe17b234b6e625bb8e118173a0a86952b1f29754ce343e5f347ce2592f38302` |

Both manifests include linux/amd64 and linux/arm64. Both selected images report **LibreOffice
26.8.1.1**, compared with **26.8.0.3** in their predecessors. The custom image still builds with
`ttf-mscorefonts-installer=3.8.1`; `fc-match Arial` selects `Arial.ttf`. The local-server variant keeps
its existing font-substitution tradeoff; the upgrade does not add Microsoft fonts to that image.

Upstream references: [Gotenberg 8.38.0](https://github.com/gotenberg/gotenberg/releases/tag/v8.38.0),
[Gotenberg 8.38.1](https://github.com/gotenberg/gotenberg/releases/tag/v8.38.1), and
[LibreOffice 26.8.1](https://blog.documentfoundation.org/blog/2026/10/02/libreoffice-26-8-1/).
8.38.1 corrects the Go-module release and has the same code as the 8.38.0 Docker image; it adds no
Docker-image change. 8.38.0 brings request-body enforcement before multipart parsing, outbound-policy
and Chromium-context fixes, updated dependencies and Debian security packages, and LibreOffice
26.8.1. Lesson3 uses the LibreOffice conversion route, not Chromium rendering. LibreOffice's patch
includes DOCX alignment, spacing and hyperlink corrections. These are maintenance benefits, not
claims of a newly observed Lesson3 rendering defect or a measured speed improvement.

The raw-body limit now counts multipart framing too. The real conversion and wire suites pass with
our generated documents and unchanged app requests. No conversion flags or output options change.

## DOCX and PDF fidelity

Fixtures come from the generator's pinned source commit
`f83db61931566df6bde9252db552bd353ed43d7a`: Physics Greenhouse Effect and Climate Change,
Essential Mathematics Indices, and Mathematics Trigonometry I. Indices and Trigonometry exercise
full-width tables extracted from framework prose; the lesson sequences also exercise equations,
resource links and long multipage tables.

For each fixture, generate all four deliverables through Lesson3's current native-field adapter:
Lesson Sequence, Final Explanation, Teacher Key and Summary Table. Feed the **same DOCX bytes** to
both old and new converters. Compare the Arial variants with each other and the LibreOffice-only
variants with each other; do not compare different font configurations as if they were regressions.
Input SHA-256 hashes and all per-document results are in
[`evidence/gotenberg-8.38.0-comparison.json`](evidence/gotenberg-8.38.0-comparison.json).

| Fixture | Lesson Sequence pages | Final Explanation | Teacher Key | Summary Table |
| --- | ---: | ---: | ---: | ---: |
| Physics | 50 | 7 | 4 | 4 |
| Indices | 56 | 7 | 4 | 4 |
| Trigonometry I | 69 | 7 | 4 | 4 |

These counts match before/after for both image variants. **24 document pairs / 440 page pairs**
were compared (48 PDFs in total). Every page is pixel-identical at **96 DPI**. Page dimensions,
MediaBox/CropBox, `pdftotext -layout` output and `pdfinfo -url` annotation destinations/page numbers
also match. Visual spot-checks include the Indices table pointer and the full-width Trigonometry
table. This establishes no observed layout change on these fixtures, not an all-documents guarantee.

Reproduction tools: `pdfinfo -f 1 -l <page-count> -box`, `pdfinfo -url`, `pdftotext -layout`, and
`pdftoppm -r 96 -png`; compare corresponding raster pages as RGB pixels. Regenerate DOCX with
`rawToBundle`, `withRowIds`, `bundleToAresData` and `generateBundleDocx`, matching the existing
adapter-fidelity gate. The evidence file records inputs so the same documents can be traced.

The existing `fidelity-spike.ts` and `adapter-fidelity.ts` gates pass for each fixture: **5/5**
content/package checks and **7/7** adapter/fidelity checks per fixture. Generator sources,
dependencies, attribution and render options are unchanged. No render-version bump is needed for
this maintenance change: the measured rendered output is unchanged, matching the September policy.

## Verification

- Custom ARM64 image builds; real Arial and its pinned installer are verified.
- Both upstream image variants include AMD64 and ARM64 manifests; their LibreOffice versions are
  checked by running the selected images.
- Production build/migration, type-check, lint, formatting, 1,638 unit and 316 integration tests pass.
- Built-app wire suite: 402 passed, with four existing SMTP-dependent skips.
- Deploy-sidecar branches: 15 passed; release bundle, release publishing and online-updater checks pass.
- Full Chromium browser suite: **127 passed without retries**.

The comparison runs and all suites use the isolated `lesson3-codex-probe` stack, port 3103. No live
installation is used for fixture-writing tests. No endpoints, authorization rules, schema,
application/generator code or workflow files change. The tracked test environment is restored.
