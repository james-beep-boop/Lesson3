# Source-only review / correction

**Verdict: retain F4 as Low, amended. Reject the auth-secret takeover lead. No fix proposed.**

I read the two source files you pasted and did not run anything. My greps for a subject length cap in `app/src` and for the Subjects collection returned no usable output, so I have not independently confirmed the contract's subject limit or any `maxLength` on `subjects.name`. For those two points I'm relying on your statement that 201 characters is contract-valid.

## F4: long subject offered, then refused

**The code supports the finding.**

- `taxonomy.ts:81-144` (`classifyMissingTaxonomy`) has no length check. The subject comes straight from the file's `META.subject`, so a 201-character name is offered as new and returns 409 `needsConfirmation` with the item in `missing`.
- `uploadBundles.ts:172` (`parseApprovals`) rejects `subject.length > 200` with a 400 `createTaxonomy must be a JSON array of {subject, grade}`. The client sends back exactly the subject it was offered, so the approval fails.
- The file header at `uploadBundles.ts:16-20` says an approval is a 400 only when "the files do not need" it. That is not what happens here, so the code contradicts its own stated contract.
- The 400 message is also misleading. It describes a malformed array, but the real problem is the length of one name, and the user gets no hint of which.

**Amendments I'd make:**

1. **Fix the wording.** The defect is that preview and approval disagree about the allowed subject length. Which side is right is a design call, and either resolution is acceptable. The same upfront rejection applies if the file contract is what should be tightened.
2. **Fix the audit script's assertion.** `boundary-controls.ts:31` asserts `confirmed.status === 200`. That hard-codes one resolution, which contradicts the "either is fine" framing. It should pass if the preview refuses the name upfront (4xx, nothing offered) or if the approval succeeds. It should fail only on the current offered-then-refused combination.
3. **State the preview/approval mismatch directly.** In the finding text, say that preview and approval disagree about the same 201-character input, rather than saying long names must be allowed.
4. **Mention the length check's order.** The check runs on the untrimmed string at line 172, and the trim happens afterward at line 174. A name of at most 200 characters after trimming but over 200 before would also be refused. That is a narrower edge. I haven't tested it, and it only matters if file subjects can carry padding.
5. **Keep severity Low.** The input needs a Site Administrator, the failure is a clean 400 with nothing created, and no data corruption, security impact or school impact is shown. Preview writes nothing, so a retry after editing the file is safe.
6. **Scope what was not tested.** No large-payload DoS was attempted. `editDistance` is O(n·m) over names (`taxonomy.ts:43-58`) and runs against each existing and new name. With names at the 200-character range that is bounded and small. I'd record it as not examined rather than as a finding.

## Auth-secret takeover lead: reject

The evidence is sound. The check at `boundary-controls.ts:8-15` rereads with `overrideAccess: true, showHiddenFields: true`, so the hidden fields really are visible to it. All four (`resetPasswordToken`, `resetPasswordExpiration`, `salt`, `hash`) were unchanged after the PATCH. That matches Payload's `baseAuthFields` access denial.

The 200 status is not a contradiction. Payload drops fields the caller may not write rather than erroring, so it is expected. The trusted reread proves the outcome, not the status code. I'd record it as a rejected hypothesis with a pointer to this check as the regression guard.
