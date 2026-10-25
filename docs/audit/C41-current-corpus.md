# C41 Current malicious input corpus

## Chunk contract

- Owner: sole auditor (Codex); baseline `bd5f07863a150cd51245b9c942502efa19d4014d`.
- Mandatory: real-parser corpus for web JSON/ZIP and CLI JavaScript; truthful extension/content
  handling, prototype keys/deep/large/invalid-UTF8 data, ZIP bomb/count/ZIP64/duplicate/traversal/
  truncated cases, script/HTML text propagation, body framing/limits, role controls, health/resource
  monitoring and unchanged-state or intended-commit checks. Deployment proxy limits stay separate.
- Artifacts: private generated corpus and exact recipe/hash manifest, versioned audit runner,
  sanitized results here and any verified findings. No raw credentials or corpus/log dumps in Git.
- Exclusions: none. Run finite bounded batches under the approved target lock. Exit: every named
  input family has evidence or a precise outstanding check, with parser selection and controls explicit.

## Current results — partial coverage

The first web batch finished with exit 0: **35 HTTP requests**, covering all 26 prepared groups.
Ten requests exercised the role control (anonymous plus nine seeded roles); only the Site
Administrator imported. Each of the other 25 groups used that administrator. Expected rejections
and successful imports matched the recipes. Five groups intentionally recorded behavior without
presuming a policy violation. This is not a completed C41 chunk.

All imported candidate plans were deleted through the authorized API. Four collection snapshots
(subjects, subject-grades, lesson plans, versions) matched the original documents after each corpus
group and at completion; no candidate remained. Rate counters, sessions, jobs and sequence numbers
are outside that equality assertion because these requests legitimately affect them. The traversal
archive was processed in memory; sentinel paths under `/tmp` and `/app/tmp` were absent before and
after. An authenticated `users/me` check passed after every non-control group.

The private corpus contains 54 files, 11,167,958 compressed/standalone bytes in total. Each upload
verified its file length and SHA-256 against the generated manifest. Node v24.22.1, JSZip 3.10.2.

| Group | HTTP | Imported | Duration ms | Rejected / skipped |
|---|---:|---:|---:|---:|
| `role-control` | 200 | 1 | 113 | 0 / 0 |
| `malformed-json` | 200 | 1 | 64 | 23 / 0 |
| `extensions` | 200 | 1 | 36 | 3 / 0 |
| `plain-bom` | 200 | 1 | 36 | 0 / 0 |
| `zip-bom` | 422 | 0 | 7 | 1 / 0 |
| `invalid-utf8` | 200 | 1 | 34 | 0 / 0 |
| `zip-paths-and-skips` | 200 | 2 | 57 | 0 / 2 |
| `empty-zip` | 422 | 0 | 5 | 1 / 1 |
| `truncated-zip` | 422 | 0 | 5 | 1 / 0 |
| `zip-entry-overflow` | 422 | 0 | 6 | 1 / 0 |
| `zip-forged-count` | 422 | 0 | 6 | 1 / 0 |
| `zip-duplicate-count` | 422 | 0 | 6 | 1 / 0 |
| `zip64-valid` | 200 | 1 | 33 | 0 / 0 |
| `zip64-overflow-locator` | 422 | 0 | 4 | 1 / 0 |
| `zip-duplicate-filenames` | 200 | 1 | 36 | 0 / 0 |
| `zip-bad-crc` | 200 | 1 | 47 | 0 / 0 |
| `plain-file-too-large` | 422 | 0 | 23 | 1 / 0 |
| `plain-file-exact-limit` | 200 | 1 | 74 | 0 / 0 |
| `zip-file-expansion` | 422 | 0 | 46 | 1 / 0 |
| `zip-dishonest-size` | 422 | 0 | 30 | 1 / 0 |
| `zip-json-count` | 400 | 0 | 44 | 0 / 0 |
| `zip-total-expansion` | 400 | 0 | 759 | 0 / 0 |
| `duplicate-bundle-identity` | 422 | 0 | 20 | 2 / 0 |
| `taxonomy-no-consent` | 409 | 0 | 8 | 0 / 0 |
| `stray-taxonomy-consent` | 400 | 0 | 9 | 0 / 0 |
| `taxonomy-case-clash` | 422 | 0 | 8 | 1 / 0 |

The malformed batch rejected 23 files while importing its valid peer, including 15 unexpected own
keys at root/META/lesson, invalid roots/syntax/polyglot inputs, and 10,000/20,000-deep arrays. The
prior inherited-key contract fix therefore has current wire-level counterexamples; this does not
close its separate fingerprint/deployment review.

## Interpretation and counterevidence

- The standalone BOM-prefixed JSON imported, whereas the exact same bytes inside a ZIP returned
  422. This is a reproducible transport inconsistency; intended BOM policy and user impact need
  reconciliation before accepting a defect/severity.
- An invalid UTF-8 byte inside prose became U+FFFD and imported. No strict encoding contract was
  assumed. Downstream content fidelity remains to be tested.
- Duplicate ZIP filenames imported only the second entry without a rejection/skip for the first.
  This differs from duplicate *semantic identities*, which correctly rejected both files.
  JSZip's map behavior explains the result; decide whether archive ambiguity must be reported.
- A stored ZIP entry with a deliberately stale CRC imported modified text. **This is a documented
  tradeoff**, not a newly discovered integrity boundary: `docs/DECISIONS.md:2849` explicitly leaves
  eager archive-wide CRC checks off to preserve inflation bounds. CRC is not authentication.
- A traversal-looking ZIP name is a data label, not a filesystem destination. Its valid JSON
  importing is not a traversal exploit; there was no observed filesystem write.

The expansion case was repeated specifically because the initial resource sampler started after
the first batch finished. With sampling active before execution, the 205 MiB expanded archive
returned 400 in **752 ms**, with unchanged lesson/taxonomy snapshots and a successful subsequent
identity check. Ten application-cgroup samples across 2.24 seconds, targeted every 200 ms plus
sampling overhead, ranged from 209,809,408 to 339,333,120 bytes. No OOM, OOM-kill or cgroup max event
occurred. These are sampled values, not an exact request peak or a production capacity estimate.
This follow-up repeated the ten role controls and one expansion request, not the entire corpus.

The body-framing follow-up used the same marked target and Site Administrator fixture. Chunked
preview/save bodies of 4,000,126 bytes returned 413 after the field-byte check. A streamed chunked
upload of 209,977,504 bytes (one byte over the 209,977,344-byte request budget after multipart
framing) returned 400 `Upload too large`; the plan count remained unchanged at 2. The app stayed
running with `OOMKilled=false`; a single cgroup sample was 820.1 MiB of 8 GiB. This demonstrates
the application’s post-parse defense and its memory cost. The required public proxy ceiling and
public-path rejection remain unverified.

## CLI extractor corpus

The real `extractAresData` ran in the pinned dependency container, network disabled: **29 cases,
exit 0**, five accepted and 24 rejected. Dynamic exported calls, getters/setters/methods, computed
keys, spreads, member references, interpolation, regex, BigInt, prototype keys, sparse arrays,
functions, dynamic exports and invalid/polyglot syntax refused. A global execution sentinel and
Object prototype sentinel remained unchanged after every case. Input strings were parsed only.

Plain template strings and constant concatenation are intentionally accepted. Executable top-level
statements and unexported dynamic initializers are intentionally ignored and never executed.

### CLI ingest entry point

The real operator path was exercised separately in the pinned Node 24 dependency container with the
marked runtime database and the synthetic `role-control.json` bundle:

```text
npx payload run scripts/ingest.ts -- /audit-corpus/role-control.json
```

It exited 0 and reported one new Official `1.0.0` plan (`ZZ_AUDIT_C41_role_control`, plan 27,
subject-grade 1), with the expected two non-blocking warnings for intentionally empty
`FINAL_EXPLANATION` sections and `SUMMARY_TABLE` lesson rows. A Payload Local API cleanup then found
and deleted exactly that marked plan; the remaining marked-plan query returned zero. Direct database
counts after cleanup were subjects 1, subject-grades 2, lesson plans 2, and versions 2. The first
attempt to collect an authenticated pre-count hit the already-known login rate limit (429), so this
is entry-point and cleanup evidence rather than a full before/after fingerprint proof. The raw
command log and cleanup output remain private.
The catalog's broad refusal premise must be read in light of this actual contract; accepting those
inert statements is not proof of code execution. This probe exercises the extractor, not the full
CLI filesystem/import/transaction entry point.

## Approved taxonomy and actual PostgreSQL failure

A separate two-case HTTP probe (`c41-taxonomy-wire.mjs`) completed with exit 0. With explicit
consent, a request containing one existing-taxonomy file and one new-subject/grade file returned
200/count2, created exactly one subject and grade, and committed exactly two plans/versions.
Authorized cleanup restored the original four-collection snapshot.

For the negative case, a temporary **BEFORE INSERT** trigger on `lesson_bundle_versions` rejected
only the synthetic title `ZZ_AUDIT_C41_TX_FAIL`. Immediately before raising, its PostgreSQL log
reported `peer_versions=1, new_subjects=1, new_plans=2`: the first peer version and newly consented
taxonomy had actually been written inside the transaction. The upload returned500. A snapshot
**before cleanup** equalled the original, proving rollback rather than the test deleting leftovers.
A subsequent authenticated identity check succeeded. The trigger and function were dropped in
`finally` and their absence verified; no fault hook remains in the application or database.

The host controller checked both the Docker project label and the PostgreSQL database comment
against the isolated target's marker, and refused an existing function with that name. Reproduce
only under the exclusive target lock in that marked disposable database. Install a narrowly
conditional trigger, run the audit helper with the standard private fixture/corpus/result paths,
then remove the trigger/function even if the helper fails. A generic500 alone does not prove the
intended injected fault: retain the trigger's in-transaction counter log as well as snapshot equality.
All raw logs, fixture data, exact executed runner bytes and hashes remain private.

## Reproduction and provenance

### Rich prose through preview, browser, export, and mail

The sink probe `app/tests/audit/c41-content-sinks.mjs` completed with exit 0 on the isolated
stack. It imported a full canonical bundle whose title, unit fields, every lesson prose field,
Final Explanation, and Summary Table contained the literal marker
`<script>`, `<img onerror>`, `<svg>`, and a `javascript:` string.

- Stored and unsaved HTML previews returned 200 with the shared CSP
  `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'` and `nosniff`.
  The raw HTML contained escaped text (`&lt;script&gt;`), with no actual script/img/svg/iframe
  tags. The marker remained visible text.
- Chromium loaded the served preview over the target network address. The DOM contained zero
  `script`, `img`, `svg`, or `iframe` elements and zero sampled `onerror`/`onclick`/`onload`
  attributes. The marker was present in `innerText`; the document title contained the escaped
  marker; no console errors occurred. The browser image's HTTPS-first behavior upgraded the
  service name, so the final browser check used the isolated app container IP while the API
  requests continued to use `http://app:3000`.
- DOCX preparation returned 202, the status reached ready, and the warm export returned 200
  `application/zip` with 45,299 bytes.
- Email preparation returned 202. Mailpit received a message to the synthetic teacher address
  with a CR/LF-free subject, the marker in the plain-text body, and one `bundle_docx.zip`
  attachment. The first two attempts found an older password-reset message; the runner was fixed
  to select a fresh `Lesson plan:` subject and was then rerun successfully. The initial failed
  jobs were caused by that test-selection mistake followed by cleanup, not by a product finding.

This is strong evidence for the current preview/export/mail path, while browser coverage remains
limited to the Chromium served preview. WebKit, editor UI controls, PDF, and other notification
templates remain outside this bounded probe.

Audit-only helpers: `app/tests/audit/c41-generate.mjs`, `c41-web-corpus.mjs`,
`c41-cli-corpus.ts`, `c41-content-sinks.mjs`. Generate outside the checkout with
`LESSON3_AUDIT_CORPUS_DIR`; run web tests
under the documented target lock with the marked synthetic fixture, corpus directory, result path,
and `E2E_BASE_URL=http://app:3000`. The optional `LESSON3_AUDIT_CORPUS_GROUP` selects the named
non-control group while retaining role controls. CLI extraction requires only the private result
path. Never point these mutation/cleanup probes at a shared or production database.

Exact executed helper copies and SHA-256 records were saved privately **before formatting**.
The published helpers were subsequently formatted; do not substitute their post-format hashes for
executed-byte provenance. The monitored web run used the later group-selection variant. Corpus
manifest hash: `1c13d671e09809cc88b77c51d5c41c4588ee6154074baa82d4acfba732a5c12f`.

## Outstanding mandatory checks

Still pending: full CLI corpus import and multi-file all-or-nothing sweep; remaining editor/PDF/WebKit/browser sink checks;
remaining taxonomy-consent shapes; reingest and true
concurrent write behavior; omitted/chunked/misdeclared request bodies and proxy posture; compressed
archive/body limits and remaining exact boundary/count combinations; real browser verification.
The current pass is not evidence for those checks or a clean-audit conclusion.
