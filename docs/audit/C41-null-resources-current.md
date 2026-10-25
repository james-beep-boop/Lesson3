# Current null-resource wire checks

Baseline: `bd5f07863a150cd51245b9c942502efa19d4014d`; synthetic disposable target; audit only.

The current `app/tests/http/nullResources.http.spec.ts` suite passed **8 tests** in 4.46 seconds
(exit 0) against the marked target. A bundle with `video: null` and `reading: null` resource
slots was accepted through the Site Administrator upload route, read by a Teacher, edited through
`save-as-new`, and exported to DOCX. The wire checks preserved null slots and populated resource
records throughout; the DOCX rendered null slots using the intended search fallback while retaining
the populated links. Empty or half-populated resource records remained rejected.

Fixture teardown completed and the target lock was clear; raw output is private at
`logs/c41-null-resources-http.log`.

This is a focused null-resource fidelity check. It does not close the wider C40/C41 ingest corpus,
proxy, editor/PDF/WebKit, concurrency or full export catalog.
