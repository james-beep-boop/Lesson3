# Current export endpoint wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The focused `app/tests/http/endpoints.http.spec.ts -t "Export endpoint"` selection passed **6
tests** in 9.06 seconds (118 other tests skipped; exit 0) against the marked target. It covered
unauthenticated prepare refusal, end-to-end read-only Teacher DOCX and PDF exports, stray-job and
kind-scoped poll bindings, and repeated cold-prepare deduplication. The DOCX and PDF jobs produced
the expected archives through the current worker and Gotenberg sidecar.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c54-export-endpoint-http.log`.

This is focused export endpoint evidence. It does not close the wider export fidelity, generator,
PDF/browser, queue or deployment-parity catalog.

The focused `endpoints.http.spec.ts -t "JSON export"` selection also passed **3 tests** in 2.73
seconds (121 other tests skipped; exit 0), covering unauthenticated and unknown-version refusal and
an authenticated Teacher's Standard AReS JSON download. Raw output is private at
`logs/c54-json-export-http.log`.

The focused `endpoints.http.spec.ts -t "per-document export"` selection passed **8 tests** in
8.96 seconds (116 other tests skipped; exit 0), covering authentication and tag validation, cold
serve-only refusal, warm DOCX attachment and warm PDF inline delivery, and missing-deliverable
handling. Raw output is private at `logs/c54-per-document-export-http.log`.

The focused `endpoints.http.spec.ts -t "Preview endpoint"` selection passed **5 tests** in 2.78
seconds (119 other tests skipped; exit 0), covering unauthenticated/read-only and editing gates,
stored and unsaved prose overlays, structural-change refusal, and script-free preview behavior. Raw
output is private at `logs/c54-preview-endpoint-http.log`.
