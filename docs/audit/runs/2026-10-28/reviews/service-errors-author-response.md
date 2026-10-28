# Haiku response — converter timeout and system-facts hypotheses

## Verdicts

Checked against the supplied excerpts and original reports only. I did not run anything, so Sol's runtime results are taken as reported and are not independently reproduced.

| Lead | Verdict | Basis |
|---|---|---|
| P048-C1 body-read timeout escapes wrapper | **Retain, amend to Low** | Excerpt confirms the code. Sol's runtime result is accepted as reported. |
| P048-C2 copyright year contradiction | Retain, unverified | `attribution.yaml` not in excerpts. |
| P048-C3 `clean` drops `id` at every depth | Retain, unverified, low | `adapter.ts` not in excerpts. |
| P048-C4 `null` → `''` on non-string fields | Retain, unverified, low | Schema types not supplied. |
| P048-C5 `versionDeliverables` parity gap | Retain as low-likelihood hypothesis | Needs Payload returning a non-array; not supplied. |
| P045-C1 runtime throw in Manage panel | **Reject as stated** | Confirmed for two readers (below). Three readers remain unverified. |
| P045-C2 substring id search | **Amend to open question** | Expected policy is not stated, so it is not yet a defect. |
| P045-C3 strand label depends on row order | Retain, unverified | `substrand.ts:203-210` not in excerpts. |
| P045-C4 whitespace-only `SMTP_HOST` reports Ready | Retain, Low, unverified | `systemFacts.ts:219`, `:272-275` not in excerpts. |
| P045-C5 `readdir` failure on a fresh install | Retain as open question | Depends on whether the cache directory is created; not in excerpts. |
| **New:** `docxToPdf.ts:58` env read per call | **New lead, Low** | Not in either report. See below. |

## P048-C1: checks against the excerpts

- `docxToPdf.ts:59-70`: the `try` covers only `fetch`. Confirmed.
- `docxToPdf.ts:79`: `await res.arrayBuffer()` is outside the `try`. Confirmed.
- `previewVersion.ts:211-217`: only `PdfConversionError` maps to 502. Anything else maps to 500 with "Could not render this preview." The log line says "render failed", and the comment at `:215` says a throw there is "a real generator failure". So a body timeout is misclassified as a generator failure in logs and HTTP status.
- `previewVersion.ts:206-208`: `pdf` is assigned only on success, so no partial artifact is served. This matches Sol's "no content loss" claim.
- Amendments:
  - **Severity:** Low, matching Sol. The original "low to medium, depending on callers" is no longer open-ended for the preview path. The only caller in the excerpts is `previewVersion.ts`, and it maps to 500. Other callers are still unchecked.
  - **Scope:** the claim is about error category and diagnostics. It is not a content, authorization, or capacity claim.
  - **Evidence grade:** the HTTP mapping is source-traced. Sol's fault-server result used a 150ms timeout, so it does not establish real sidecar behavior at the default 120s.

## P045-C1: checks against the excerpts

- `artifactCache.ts:32` resolves `MAX_BYTES` at module load, and `:217-219` returns that constant. `artifactCacheMaxBytes()` cannot throw at call time. Sol's correction is right.
- `docxToPdf.ts:36-37` is a `||` fallback and `.replace` on a string. `gotenbergUrl()` cannot throw. Sol's correction is right for this reader. Sol's claim that the probe's fetch is caught is beyond the excerpt (`systemFacts.ts:87-95`), so I accept it as reported and have not verified it.
- The original's reading of the comment at `systemFacts.ts:147-148` is wrong. That comment says that re-reading env in this function would have thrown from outside the `try`. It does not say the calls should be inside a `try`.
- **Wording correction to Sol's rejection:** `lib/env.ts:8` says "throw at boot", but the actual failure point is `artifactCache.ts` module evaluation (`:32`). That is process boot only if the module is imported eagerly. The import graph is not in the excerpts. If it is first imported lazily, the failure surfaces at request time. The rejection of the running-Manage-failure claim still holds for the post-import case.
- Unverified residue: `artifactCacheDir`, `isPublicLibraryEnabled`, `errorTrackingEnabled`, and the `Promise.all` at `:217`. Keep these as a failed-hypothesis note, not a finding.

## New lead: per-call env read in `docxToPdf`

`docxToPdf.ts:58` calls `positiveIntEnv('GOTENBERG_TIMEOUT_MS', 120_000)` inside the function body, before the `try` at `:60`.

- A malformed value throws a plain `Error`, not `PdfConversionError`.
- `previewVersion.ts:211` then falls through to the 500 branch.
- The read happens on every request. `lib/env.ts`'s fail-fast-at-boot rationale does not apply unless some boot-time reader exists, which the excerpts do not show.

This is a local-reading lead only. It needs a runtime check before it becomes a finding, and it should be filed separately from P048-C1 unless the lead decides they share a fix.

## Unresolved-question updates

- **P048, does any caller branch on `PdfConversionError`?** Partly answered. `previewVersion.ts:211` does. Other callers are unknown.
- **P045, does `artifactCacheMaxBytes` throw?** Answered: no.
- **P045, does `gotenbergUrl` throw?** Answered: no.
- **P045, is the cache directory created at startup?** Open. The excerpts do not show creation.
- **P048, should `docxToPdf` validate `%PDF`?** Open. Not in the excerpts.
- **P048, can cache scope strings contain `::`?** Open. Not in the excerpts.
