# C40 — Ingest code review

## Chunk contract

- **Owner:** author-a (Claude); baseline `d3714a5b210e1bac7bfa8884f4fce9a34add37b5`; 2026-10-24.
- **Mandatory checks:** `extract.ts` never evaluates input; the contract gate; web upload accepts
  only `.json`/`.zip`; size/count/time limits; JSZip directory pre-count; malformed-input handling;
  all-or-nothing semantics; jsdom/DOMPurify configuration on the preview path.
- **Artifacts:** this report; [findings/C40-ingest-code.md](findings/C40-ingest-code.md); a unit-level
  probe of `contractDrift` run from a scratch copy outside the checkout (recipe in F-C40-001).
- **Exclusions:** `previewParse.ts`/`recoveryParse.ts`/`parseFormat.ts` are edit/preview body parsers,
  not ingest; read only for the shared body caps and left to C5.4/C5.5. Uploading the C41 corpus over
  HTTP is C41 (runtime).
- **Exit:** each check answered from source, with anything that needs a live upload carried to C41.

## Outcome

**Complete for source.** One candidate, F-C40-001 (provisional Low): the contract gate does not
reject unknown keys that share a name with a built-in object property (`constructor`, `toString`,
…), and accepts anything nested under them. Reproduced at unit level.

## Checks

| Check | Result at baseline |
|---|---|
| `.js` extraction never executes input | **Confirmed.** `extractAresData` parses with acorn and walks the AST (`extract.ts:158–227`). Only literals, `+` on string/number literals, `+`/`-` on numbers and quasi-only templates are evaluated; calls, identifiers inside data, member access, spreads, getters/setters, methods, computed keys, regex and BigInt literals throw. No `require`, `vm`, `eval` or `Function` in `src/ingest/`. CLI only |
| Web accepts only JSON / ZIP of JSON | **Confirmed.** Extension check per file (`uploadFiles.ts:188–203`); ZIP entries not ending `.json` are skipped; JSON goes through `JSON.parse` only (`extract.ts:256–274`) |
| `__proto__` | Rejected in both extractors (`extract.ts:130,210,233–242`). Other built-in names are not — see F-C40-001 |
| Contract gate | Hard gate on the raw object (`ingest/index.ts:429–435`), every schema object `additionalProperties: false`. Bypass for built-in property names: F-C40-001 |
| Authorization | Site Administrator checked before rate limit and before reading the body (`uploadBundles.ts:37–59`) |
| Size/count limits | 500 JSON per request, 5 MB per JSON, 50 MB per ZIP, 200 MB expanded total, 1,000 ZIP directory records counted before JSZip builds anything; streamed inflation stops at the byte limits even if ZIP metadata lies (`uploadFiles.ts:15–25,65–150`). Lead L-C40-01 for bodies without `Content-Length` |
| Malformed input | Invalid JSON, wrong root, missing groups, contract drift and non-generatable content become per-file rejections. Very deep nesting: V8's `JSON.parse` accepts 200,000-deep arrays, then the recursive `__proto__` walk throws `RangeError`; it is caught before `inputValidated`, so it is reported as that file's rejection, not a 500 (`ingest/index.ts:473–477`; reproduced in plain Node) |
| All-or-nothing | Pre-flight is read-only; all accepted files plus approved new subjects/grades are written in one transaction, with subject-grade advisory locks and plan row locks; any write error rolls back everything (`ingest/index.ts:643–819`). Web upload is deliberately partial at the file level (invalid files rejected, valid ones committed together) |
| ZIP names | Never touch the filesystem; used only as labels in the JSON response, rendered by React (escaped) |
| Preview path | `new JSDOM('')` (`lib/domWindow.ts`): scripts and subresources are off by default. DOMPurify allows a short tag list and `href/target/rel/colspan/rowspan` only, no data attributes; http(s) links get `noopener noreferrer` (`lib/sanitizeHtml.ts`). Input is DOCX the app generated from validated data |

## Leads (for C41 / C62, not findings)

- **L-C40-01 — No body ceiling without `Content-Length`.** `assertDeclaredBodyWithin` only checks a
  declared length; a chunked upload is buffered whole by `req.formData()` before the per-file caps
  apply (`uploadBundles.ts:56–66`). Only a signed-in Site Administrator reaches that line, and
  `docs/OPS.md` makes a proxy ceiling mandatory. C41 should send a chunked oversized body locally, and
  the parity pass should confirm the proxy ceiling.
- **L-C40-02 — Parsed-object memory.** Up to 200 MB of JSON is held parsed at once (ZIP entries are
  read eagerly; every prepared bundle stays in memory until the write transaction ends). Parsed
  objects are several times larger than their text. C41/C62 should measure peak RSS for a
  maximum-size upload on target-like memory.

## Resume point

C41 corpus on the C01 target (Site-Admin fixture, hold the lock), adding to the catalog list: keys
named `constructor`/`toString` at root, inside `META` and inside a lesson (F-C40-001), a 200,000-deep
array file, and a chunked body over 200 MB.
