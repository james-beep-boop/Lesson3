# C40 Current ingest and parser review

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: review all ingest modules/schema with their tests, safe CLI AST extraction versus
  JSON/ZIP web inputs, contract/shape/resource validation, byte/count/time bounds, taxonomy consent,
  transaction/locking/reingest/fingerprint paths, and preview/recovery/format parser boundaries.
  Confirm preview HTML sanitization and jsdom execution/resource settings at their actual trust boundary.
- Artifacts: this report, C41-current-corpus.md, audit probes and sanitized scan results; private
  corpus recipes/hashes/logs. Source and test coverage ranges are recorded as work proceeds.
- Exclusions: none. Exit: all mandatory paths have source plus relevant fixture/runtime evidence,
  with unanswered premises and unrun combinations explicitly retained.

## Source review — complete files, partial component assurance

Web uploads authorize Site Administrators before body parsing and rate accounting, then prepare
JSON/ZIP inputs in memory. CLI inputs select static Acorn extraction for JavaScript or JSON.parse
for JSON. Both converge on contract/generator validation and taxonomy preflight. Web invalid files
are individually rejected; valid peers commit in one transaction. Missing taxonomy holds the
whole request pending explicit consent. The CLI keeps an atomic batch contract.

| Source | Read range | Purpose and invariant checked |
|---|---|---|
| `app/src/ingest/extract.ts` | 1–274 | Acorn literal evaluator and JSON guards; uploaded/source input never evaluated |
| `app/src/ingest/uploadFiles.ts` | 1–259 | Compressed/expanded/count limits, parser-aligned central-directory count; in-memory extraction |
| `app/src/ingest/contract.ts` | 1–156 | Own-key/schema drift walker; built-in inherited names are not accepted schema entries |
| `app/src/ingest/ares-contract.schema.json` | 1–244 | Canonical keys/types/required groups/enums and intentional null documents |
| `app/src/ingest/toBundle.ts` | 1–54 | Canonical-to-stored mapping before generator completeness gate |
| `app/src/ingest/resourceLinks.ts` | 1–224 | Exact phase/resource shapes and permitted HTTP(S) link strings |
| `app/src/ingest/errors.ts` | 1–15 | Typed ingest rejection boundary |
| `app/src/ingest/taxonomy.ts` | 1–144 | Exact subject/grade matching, near-miss refusal, consent classification |
| `app/src/ingest/contentEquality.ts` | 1–35 | Strip storage-derived values for unchanged-reingest comparison |
| `app/src/ingest/releaseAncestry.ts` | 1–73 | Released versus draft ancestry and server fingerprints |
| `app/src/ingest/releaseFingerprintContext.ts` | 1–33 | Narrow trusted fingerprint carrier |
| `app/src/ingest/index.ts` | 1–835 | Read-only preflight; SG/advisory/plan locks; recheck and transactional taxonomy/version/Official writes |
| `app/src/ingest/validateGeneratable.ts` | 1–157 | Generator-required shape and phase/resource validation; absent optional documents warn |
| `app/src/endpoints/uploadBundles.ts` | 1–151 | SiteAdmin gate before rate/body parsing; approval parsing; 200/409/422 outcomes |
| `app/src/endpoints/previewParse.ts` | 1–80 | One multipart read, UTF-8 field byte limit and declared-body precheck |
| `app/src/endpoints/recoveryParse.ts` | 1–149 | Declared-body precheck, document/counter guards and paired optional multipart token |
| `app/src/endpoints/parseFormat.ts` | 1–39 | Strict export kind/document-tag enums |
| `app/src/generator/previewBundle.ts` | 1–71 | DOCX-to-Mammoth-to-sanitizer seam shared by previews and teacher content |
| `app/src/lib/domWindow.ts` | 1–17 | Shared JSDOM created without script execution/resource-loading options |
| `app/src/lib/sanitizeHtml.ts` | 1–77 | DOMPurify content allowlist; no event/style/data attributes; external HTTP links get noopener |

The transaction path rechecks existing-plan/unchanged state while holding subject-grade and plan
locks. Taxonomy creation and valid-subset writes share the transaction; errors invoke rollback.
C41 additionally verifies actual PostgreSQL write-fault rollback, including the already-written peer and newly consented taxonomy. True concurrency proof remains open. Source-required
helper behavior (`txDb`, hooks, access refresh and job/cache consequences) remains cross-chunk work.

`assertDeclaredBodyWithin` is a Content-Length guard. Post-parse field/file limits do not prove a
hard ceiling while a missing/chunked body is buffered. The recovery parser itself describes that
limitation. Its comment referring to NEXT-SESSION is historical context, not current deployment
verification; omitted/chunked-body and proxy/config review remain necessary.

## Declared body-ceiling wire probe

The standalone `app/tests/audit/c40-body-ceilings.mjs` probe passed on the isolated target after
the app image was rebuilt from the pinned source. It logged three independent HTTP POSTs with
honest oversized `Content-Length` values and valid multipart framing for the preview/save paths:

| Route | Declared length | Result |
|---|---:|---|
| `/api/lesson-plans/upload` | 210,763,776 bytes | 413, `Upload too large (max 209977344 bytes)` |
| `/:id/preview` | 5,242,880 bytes | 413, `Preview payload too large` |
| `/:id/save-as-new` | 5,242,880 bytes | 413, `Preview payload too large` |

The requests used an isolated HTTP connection per route because these intentional early rejections
close the connection while a client may still be writing the declared body. The private result file
recorded all three statuses and exit 0. This proves the application-side check for an honest
declared length; it does not prove a limit for omitted, chunked, or false headers, nor the
reverse-proxy posture.

## Chunked-body follow-up

Two additional helpers exercised HTTP/1.1 `Transfer-Encoding: chunked` without a
`Content-Length`. Preview and save-as-new each received a 4,000,126-byte multipart body whose
`data` field was 4,000,003 UTF-8 bytes (`{}` plus whitespace); both returned 413 `Preview payload
too large`. A streaming upload sent 209,977,504 bytes—one byte over the 209,977,344-byte request
budget after framing—and returned 400 `Upload too large (max 209977344 bytes)`. The plan collection
count stayed 2 before and after the upload. The direct app container remained running with
`OOMKilled=false`; one sampler observation during the upload was 820.1 MiB of its 8 GiB limit, so
this is evidence of a post-parse application cap and memory cost, not a proxy-cap proof.

The public deployment requirement remains separate: `docs/OPS.md` requires an nginx/Caddy-style
global ceiling just above 209,977,344 bytes because an omitted or chunked header reaches the
application parser first. No production proxy is attached to this isolated target, so its
configuration and public-path 413 behavior remain unverified.

## Test and runtime evidence

Read existing `extract.spec.ts` 1–197, `uploadFiles.spec.ts` 1–298,
`ingestContract.spec.ts` 1–full file, and `uploadTaxonomy.int.spec.ts` 1–201.
The upload taxonomy tests include mocked write-failure rollback and a taxonomy lookup race;
they do not replace an actual PostgreSQL write-fault or simultaneous HTTP request proof.
These suites were included in the previously recorded baseline unit/integration passes.

The standalone contract CLI gate returned **16 passed, zero failed, exit 0** in Node24, network
disabled. [C41](C41-current-corpus.md) adds 35 first-batch web requests, one monitored expansion
follow-up with role controls, 29 DB-free extractor cases, and one real `scripts/ingest.ts` entry
point import/cleanup. No product edits were made.

## Re-ingest, taxonomy approval and concurrency — current integration pass

The current `app/tests/int/reingest.int.spec.ts` suite passed **15/15** tests in the marked target.
It covered first upload creation and artifact pre-warm, same-substrand major-version attachment,
release ancestry across teacher patches, migration repair, intra-batch duplicate and ambiguous-match
refusals, empty-identity behavior, corrected-batch no-op handling, latest-version comparison,
concurrent identical web imports, valid-peer behavior around parse/contract/taxonomy failures,
all-invalid preflight, and database-lookup rollback. The current
`app/tests/int/uploadTaxonomy.int.spec.ts` suite passed **5/5**, covering rollback of newly created
subject/grade rows, same-subject approval serialization, and unnecessary or malformed approval
refusals. The private combined log is
`logs/c5-ingest-public-ratelimit-integrations.log`; the target was left clean and unlocked.

These integration cases close the named re-ingest and taxonomy-approval checks exercised here. Full
CLI corpus coverage, public proxy posture, parser/resource concurrency and browser/editor/PDF sink
coverage remain open.

The sanitizer seam uses DOMPurify after Mammoth; JSDOM has no `runScripts` or `resources` option.
That source check does not yet prove every rendered field, route CSP or browser sink. In particular,
plain strings resembling HTML should stay safe text through generation, rather than being refused
merely for containing angle brackets. Rich prose corpus and actual route/browser checks remain.

## Corrected premises and pending leads

- Non-interpolated templates, constant concatenation and ignored top-level executable statements
  are part of the static extraction contract. Accepting them without execution is expected.
- ZIP traversal-looking names are not filesystem destinations. CRC omission is an explicit
  decision (`docs/DECISIONS.md:2849`). Neither observation is automatically a vulnerability.
- JSON deep recursion is caught as a per-file rejection in the real tested upload batches;
  process-wide stack exhaustion is not established by a thrown error alone.
- Parser and preflight source review does not establish current deployment parity or prove that
  authority is refreshed after every possible wait. Any proposed race finding needs a concrete
  permission requirement plus controlled timing and retained-state evidence.

## Outstanding

Review the remaining ingest/preview/recovery tests and full CLI wiring; finish component-level
source dependencies; finish remaining taxonomy shapes, reingest/concurrency, false-header and
proxy posture, script/HTML sink and full corpus fidelity checks. C40 remains partial, with no
exclusions.
