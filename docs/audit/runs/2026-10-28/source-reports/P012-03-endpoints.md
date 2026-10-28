# P012-03-endpoints

Author: Claude Haiku (`claude-haiku-5-5`), medium effort, source-only. Source SHA `6e75a173e822e4c4be42821b0a4af48ca457bd36`. This is an unadjudicated source report; candidates are not accepted findings.

## Scope and method

I reviewed the supplied text only. I made no tool calls, edits, or fixes. I did not check unseen callers or runtime behavior. The full supplied ranges were read, so this is not a partial assessment. The policy excerpts were used only as context.

**Ranges read (all full):**
- `app/src/endpoints/parseFormat.ts:1-39`
- `app/src/endpoints/previewParse.ts:1-80`
- `app/src/endpoints/previewShared.ts:1-146`
- `app/src/endpoints/previewVersion.ts:1-236`

**Not assessed (referenced, outside range):** `enforceVersionFieldSplit`, `isEditorFor`, `findReadableVersion`, `assertDeclaredBodyWithin`, `renderBundlePreview`, `renderVersionSectionsCached`, `safePrefix`, `deliverableStem`, `runWithConversionSlot`, `docxToPdf`, `validateGeneratable`.

## Purpose and invariants

- **parseFormat.ts:** `?as=` must be `docx` or `pdf` (default `docx`). `?doc=` must be in `DELIVERABLE_TAGS`. Anything else returns 400.
- **previewParse.ts:** Bounds and parses the unsaved `data` field into a plain object. It measures UTF-8 bytes and returns 413 or 400. The recovery token is kept out of this field by design.
- **previewShared.ts:** Builds the HTML page with escaped chrome and a locked-down CSP. It applies the completeness gate (422) and maps render failures to 500.
- **previewVersion.ts:** GET of a saved version is read-gated. POST unsaved and POST preview-pdf are edit-gated. They overlay the posted data onto the stored version with `id`, `subjectGrade`, and `lessonPlan` pinned, run the field-split hook, and map `Forbidden` to 422. The PDF path has rate and concurrency limits.
- **Intentional, not bugs:** Previews skip Official immutability (previewVersion.ts:27-29). Unsaved renders are never cached.

## Candidates

No confirmed correctness defect follows from local reasoning in the supplied ranges. The items below are leads, ordered by how much they matter.

**1. Lead, severity undetermined (potentially high if unescaped).** `previewShared.ts:48` inserts `${s.html}` without escaping. The page's stated contract (lines 33-35) is no-injection. Whether this is safe depends on the generator's HTML output, which is not in range.
- Precondition: teacher prose containing markup reaches `s.html` unescaped.
- Expected: prose appears as text.
- Actual: not determinable here.
- Mitigation: CSP `default-src 'none'` should block script. Style injection remains possible under `style-src 'unsafe-inline'`.
- Reproduction: POST unsaved `data` with `"overview":"<b>x</b><img src=x>"` to a complete version. Assert the output contains `&lt;b&gt;` in the Overview section.

**2. Confirmed locally, low, user-visible.** `previewVersion.ts:99-104` maps every `Forbidden` to one fixed message about "structural changes (adding or reordering rows)." The field-split hook also governs Subject-Admin-only fields (`META.*`, `framework[].phase`, `duration`, answer keys). If the hook throws `Forbidden` for those, the teacher gets the wrong reason.
- Expected: the message names the rejected field or category.
- Actual: fixed text.
- Reproduction: as a teacher with editing access, POST a changed `META.grade`. Compare the 422 text with the save path's reason.

**3. Lead, low.** `previewVersion.ts:84-90` overlays all candidate keys onto the stored doc. Only `id`, `subjectGrade`, and `lessonPlan` are pinned. System-only keys such as `aresReleaseId`, `releaseFingerprint`, `officialChangedBy`, and `sourceVersion` pass into the hook. Preview correctness then depends entirely on `enforceVersionFieldSplit` returning only whitelisted keys. No write occurs.
- Reproduction: POST `"aresReleaseId":"fake"` and `"releaseFingerprint":"x"`. Confirm the rendered output and version metadata are unchanged.

**4. Fragility, not a current defect.** `previewVersion.ts:92-107` wraps a non-awaited `return`. The catch works only while the hook is synchronous. Line 133 calls it "pure," but the `as CollectionBeforeChangeHook` cast suggests a Promise is possible. If it returns a Promise, `Forbidden` bypasses the 422 mapping and a Promise is passed to `assertPreviewable`.

**5. Lead, low.** `previewVersion.ts:230` quotes `${stem}` in `Content-Disposition` without escaping. Safety depends on `deliverableStem` and `safePrefix`, which are not in range. Header injection via CR/LF is unlikely because `Response` rejects it. A `"` in the prefix would only malform the filename.

**parseFormat.ts** and **previewParse.ts:** no defect found. The byte-count check, the 413-before-parse ordering, and the `typeof` guard on `data` behave as written.

Security and integrity claims in these files remain unreviewed until independent review.

## Unresolved questions

- Does `renderBundlePreview` or the HTML-section renderer escape prose before producing `s.html`? (Lead 1)
- Does `enforceVersionFieldSplit` return only whitelisted keys, and for which cases does it throw `Forbidden`? (Leads 2–4)
- Does `isEditorFor` admit Site Administrators? The comments say admins are unrestricted, but line 78 is the only admission check visible here.
- Does `safePrefix` strip `"`, CR, and LF? (Lead 5)
- Does `assertDeclaredBodyWithin` pass when `Content-Length` is absent? The comment at previewParse.ts:50-53 says it does, but the code is not in range.
