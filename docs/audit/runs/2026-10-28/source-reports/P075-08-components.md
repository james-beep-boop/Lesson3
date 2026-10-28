# P075-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tools were run. Assessment is by reading the supplied text only. I did not verify that it matches baseline `6e75a173`.

**Read in full (as supplied):**
- `app/src/components/PageBackLink.tsx:1-55`
- `app/src/components/PageHeader.tsx:1-60`
- `app/src/components/PasswordInput.tsx:1-51`
- `app/src/components/PhaseSelectField/index.tsx:1-55`
- `app/src/components/RedirectToManage/index.tsx:1-44`
- `app/src/components/RequestEditingButton.tsx:1-56`
- `app/src/components/RowLabel/formatRowLabel.ts:1-26`
- `app/src/components/RowLabel/index.tsx:1-40`
- `app/src/components/SchoolName.tsx:1-17`
- `app/src/components/SubjectSelectField/index.tsx:1-63`
- `app/src/components/SubjectSelectField/options.ts:1-15`
- `app/src/components/UploadBundles/OfficialPreviewList.tsx:1-53`

**Not assessed:** imported modules that the supplied files depend on, including `fields/phases`, `Manage/panelState`, `lib/aresReleasePresentation`, `ingest/releaseDecision`, `lib/apiBase`, and the server endpoints. The policy excerpts were read as context only.

## Purpose and invariants (summary)

- **Navigation/layout components** (PageBackLink, PageHeader, RedirectToManage, SchoolName): presentational or fixed redirects. Nothing defective found.
- **Phase and subject pickers**: the phase field is a fixed dropdown, disabled for read-only users. The subject picker is a dropdown over the taxonomy that keeps stored values displayable.
- **RowLabel**: shows the first line of a value, stripping a duplicated generated prefix and truncating.
- **OfficialPreviewList**: partitions preview items into three sections. The partition is exhaustive: every item lands in exactly one section.
- **RequestEditingButton and PasswordInput**: UI state machines around one request and one toggle.

## Candidates

**C1 — Mislabelled subject on taxonomy fetch failure (Low, confirmed local reasoning).**
`SubjectSelectField/index.tsx:37,41` falls back to `{ docs: [] }` on a non-OK response and swallows errors. `options.ts:11-12` then labels the stored value `"… (not in taxonomy)"`.
- Precondition: the `/subjects` request fails, e.g. offline or session expired.
- Expected: the label should not assert the value is absent from the taxonomy when the taxonomy failed to load.
- Actual: a valid subject is labelled as not in the taxonomy, and no alternatives are offered.
- Repro: mock `fetch` to reject. Render the field with stored value `"Mathematics"`. Assert the option label is not `"Mathematics (not in taxonomy)"`.

**C2 — Taxonomy truncated at 200 (Low, uncertain).**
`SubjectSelectField/index.tsx:33` uses `limit=200&sort=name`. With more than 200 subjects, any stored value in the tail is wrongly labelled "not in taxonomy", and the admin cannot choose those subjects.
- Precondition: more than 200 subjects. Not verified.

**C3 — Hyphen-without-space treated as a duplicate prefix (Low, uncertain; policy question).**
`formatRowLabel.ts:20` accepts `-` as a separator with no required whitespace.
- `formatRowLabel('Lesson', 1, 'Lesson 1-2 Review')` yields `"Lesson 1 — 2 Review"`. The `1-2` range is partly stripped.
- Whether this is a bug depends on the intended behaviour. I do not infer that from the implementation.

**C4 — Truncation can emit a lone surrogate (Low, confirmed local reasoning).**
`formatRowLabel.ts:9` uses `value.slice(0, max-1)` on UTF-16 code units.
- Repro: `formatRowLabel('Lesson', 1, 'a'.repeat(58) + '😀b')`. The value is 61 units, so it truncates. `slice(0,59)` keeps the high surrogate at index 58.
- Expected: no broken character.
- Actual: a lone surrogate, which renders as a replacement glyph.
- Test: assert the output does not end in `/[\uD800-\uDBFF]/` before the ellipsis.

**C5 — Toggle label and `aria-pressed` both change (Low, uncertain, accessibility).**
`PasswordInput.tsx:20,27,29`: the accessible name flips between "Show" and "Hide" while `aria-pressed` also toggles. Assistive technology may announce both states, which can confuse a user. This is a lead, not a confirmed mismatch.

**C6 — Possible duplicate React keys (question, not a finding).**
`OfficialPreviewList.tsx:37` uses `key={p.file}`. If the same relative path can appear in two ZIPs in one upload, keys collide. This depends on whether `file` is unique across the request. Not verified.

**No confirmed defects** in PageBackLink, PageHeader, PhaseSelectField, RedirectToManage, RequestEditingButton, RowLabel/index, SchoolName, or OfficialPreviewList within the supplied ranges.

## Unresolved questions

1. Should a hyphen without surrounding space count as a prefix separator (C3)?
2. Is `file` unique across an upload batch (C6)?
3. How many subjects exist (C2)?
4. Do `isPhase` and `PHASE_OPTIONS` agree? Not supplied.
5. Are `users.accounts` and `curriculum` valid `PanelId` values? The file's compile-time claim is unverified here because `panelState.ts` was not supplied.
6. Does `aresReleaseLabel` produce the policy wording "ARES release: not stated"? Not supplied.
