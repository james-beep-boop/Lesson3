# C41 — Malicious upload corpus (cloud repro)

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5`; 2026-10-24.
- **Environment:** disposable cloud stack (as C31). Corpus built from the app's own `ares-export`
  output as the known-good base, mutated per case. **Locally reproduced**, not deployment-reproduced.
- **Mandatory checks:** the authorization gate; the catalog's web-ZIP and web-JSON cases; wrong
  extension; empty/truncated; prototype keys; deep nesting; entry-count and byte caps.
- **Exclusions:** the body-limit cases that need a crafted transport (chunked / missing
  `Content-Length`, L-C40-01) and the proxy ceiling are the deployment-parity pass. ZIP64-locator
  truncation crafting not done (the directory pre-count logic was read in C40).
- **Exit:** each case refused or accepted as policy expects; no version created from a bad file; no
  prototype pollution.

## Outcome

**One confirmed finding, F-C40-001 (Low), reproduced over HTTP. Everything else behaved as intended.**

### Authorization gate

| Caller | Result |
|---|---|
| Anonymous | 401 Unauthorized |
| Authenticated non-admin (editing-access, Subject Admin) | 403 "Forbidden — Site administrator only" |

(The Teacher row in the first run read 401 because that account's password had been rotated by the
C23 reset test earlier in the session; re-checked with intact non-admin sessions → 403, as above.)

### Corpus (as Site Administrator)

| Case | Result |
|---|---|
| **F-C40-001** — valid bundle + `META.constructor` key | **200, bundle created, no drift rejection** — the gate miss, confirmed over HTTP |
| valid bundle + top-level `toString` key | 200, passed the gate (skipped as content-unchanged) — same gate miss |
| `__proto__` key | 422 rejected "`__proto__` keys are not allowed"; `({}).polluted` stayed undefined |
| `.js` extension, valid JSON body | 422 "Only .json and .zip files are accepted" — no `.js` over the web |
| `.docx` extension | 422 "Only .json and .zip files are accepted" |
| 200,000-deep nested array | 422 per-file rejection "Maximum call stack size exceeded" — contained as a rejection, **not** a 500 (ugly message, lead L-C41-01) |
| truncated JSON | 422 "Could not parse the file as JSON" |
| empty file | 422 "Could not parse the file as JSON" |
| ZIP of one valid JSON | 200 (skipped as unchanged) — archive handled |
| ZIP with `../../escape.json` entry | 200 (skipped as unchanged); entry name used only as a label, nothing written to disk |
| ZIP with 1,200 entries | 422 "Too many ZIP entries (max 1000)" — counted before inflation |
| ZIP entry inflating to 6 MB (> 5 MB cap) | 422 "Exceeds the 5242880-byte JSON limit" — stream stopped at the cap |

No version row was created from any malformed or oversized file; the only version-count increases were
the legitimate re-ingests of the known-good bundle (an existing sub-strand → a new major version, as
SPEC §7 intends). `({}).polluted === false` after the run.

## Lead

- **L-C41-01 — deep-nesting error message.** A 200k-deep array is correctly refused, but the message
  is the raw "Maximum call stack size exceeded" rather than a tidy "file too deeply nested". Cosmetic;
  worth a friendlier rejection and a nesting-depth guard. Not a security defect — it is contained as a
  per-file 422.

## Resume point

Body-limit transport cases (L-C40-01: chunked / missing `Content-Length`) and the mandatory proxy
ceiling belong to the deployment-parity pass; the ZIP64-locator truncation craft can be added to this
corpus on an approved target.
