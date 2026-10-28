# P057-08-components — source-author observations

Fixed source 6e75a173e822e4c4be42821b0a4af48ca457bd36. Read-only supplied ranges; not a confirmed-finding or completed-component claim. Missing-caller and briefing limits remain explicit.

## Coverage

No tool calls were made. All seven ranges below were read from the inline text supplied in the request. I did not check them against the working tree or the baseline `6e75a173`.

- `app/src/components/Discussions/TopicComposer.tsx:1-83`
- `app/src/components/Discussions/referencePickerQueries.ts:1-37`
- `app/src/components/Discussions/submitPost.ts:1-124`
- `app/src/components/Discussions/useComposer.ts:1-66`
- `app/src/components/DocButtons.tsx:1-114`
- `app/src/components/DocStrip.tsx:1-71`
- `app/src/components/EditRecovery/Indicator.tsx:1-124`

**Not assessed:** `ComposerParts`, `ReferencePicker`, `FormField`, `lib/discussionComposer` (reducer and `classifyCreateStatus`), `lib/discussionText`, `lib/wireError`, `exportClient`, `protocol.ts`, `useEditRecovery`, `generator/deliverables`, and all access rules, callers and runtime behaviour. The policy excerpts govern lesson-plan data; these files are discussion and export UI, so I applied no policy-based findings to them.

## Purpose and invariants (from the source)

- **submitPost / useComposer:** a post is sent with a client-minted key. An uncertain outcome (timeout, lost body, 409, failed lookup) is never reported as a failure; the lookup-by-key path decides. Retry re-sends the exact last request.
- **TopicComposer:** plain text only, held in memory, locked while sending.
- **referencePickerQueries:** REST-only queries; author data is limited to names.
- **DocButtons / DocStrip:** PDF opens in a new tab, Word downloads, and both use the same export path.
- **Indicator:** every capture state is shown as visible text, and the "ago" reading should not freeze.

## Candidates

No confirmed product defect in the supplied ranges. Three leads, all unverified beyond local reading:

1. **Low lead: stale "just now" on mount.** `Indicator.tsx:52, 57, 71`. `now` starts at 0 and changes only on interval ticks. A `backedUp` status that is already old when the component mounts renders `ago(negative)` → "just now" until the first tick (up to 10 s). Expected: "· 5 min ago" at once. Actual: "just now" for up to 10 s. Precondition: the status arrives with an `at` more than 10 s old, which depends on the hook (not supplied). Reproduction: render `{kind:'backedUp', at: Date.now()-300000}`, assert the text synchronously (fails), then advance fake timers by 10 s (expect "5 min ago").

2. **Low lead: claim before any capture.** `Indicator.tsx:66-67`. `starting`/`idle` show "Your changes will be saved as a draft automatically". Whether that is untrue depends on the protocol's meaning of `idle` and on the SPEC §5 wording, neither of which was supplied. I have not inferred expected behaviour from the implementation.

3. **Uncertain lead: empty search term.** `referencePickerQueries.ts:12`. `likeAllWords(query) ?? ''` emits `where[title][like]=` for an empty or whitespace query. Whether that lists the first ten readable lessons depends on Payload's `like` handling and on whether the caller guards against empty input. Reproduction: assert the generated URL for `'   '`, then check the caller and the response in a runtime test.

4. **Uncertain lead: populated context on version lookup.** `referencePickerQueries.ts:26-37`. The comment says only author names cross the wire, but `depth: '1'` populates relationships, and `select` may apply only at the top level. Whether `lessonPlan` returns fields the picker does not need is unverified. Reproduction: call the endpoint at depth 1 and inspect the populated `lessonPlan` keys.

Considered and not reported: the `res!` assertion in `submitPost.ts:112` is safe by control flow. The 400-with-empty-lookup branch (`submitPost.ts:120-122`) is documented as intentional; whether it is correct depends on access rules I did not see. The `DocStrip` header (lines 6-11) says the caller applies the primary/secondary split, but the condensed branch also applies it (line 45). That is a documentation mismatch with no user-visible effect.

## Unresolved questions

- What do `idle` and `starting` mean in `protocol.ts`, and what does SPEC §5 promise?
- Can a mounted `backedUp` status carry an `at` older than the first tick?
- Does `classifyCreateStatus` map 400 to `uncertain`, and can the author's lookup return empty for a row that exists?
- Do the discussion UI and its endpoints have a policy source, and if so, which section governs them? None was supplied.
