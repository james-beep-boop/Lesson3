# Plan — typing speed on the version edit page

**Status:** proposal, 2026-10-23. **No code has changed.** Everything below was measured against
throwaway production builds in a scratch directory; nothing was committed or deployed. Implementation
waits for the operator's answers to the open questions in §7.

**Trigger:** the operator noticed that editing "used to be zippy, now it seems a little slow", while the
rest of the app still felt fast.

---

## 1. Summary

Typing into a prose field on a full-size lesson plan costs **56–64 ms per keystroke** on a fast Mac and
**224–256 ms** with the CPU throttled 4× (a stand-in for an inexpensive laptop, or a busy one). Nearly
all of it is spent inside Payload's admin form, not in Lesson3 code, and it scales with the size of the
plan.

**It is not a regression.** Production builds of v0.96 (2026-10-12, before drafts, Combine and the
Payload 3.91 upgrade), v1.00 and `main` (`a5ef612`) do the same work per keystroke. The likeliest reasons
it *felt* faster before are a smaller plan being edited, or a less busy laptop: during this investigation
other Docker workloads were using 5–7 of the Mac's 8 cores, and this cost is pure main-thread
JavaScript, so it competes directly with them.

Two places in Payload's pre-built client bundle account for the cost. Patching both in a prototype took
a keystroke from **224 ms to 32–40 ms** at 4× CPU throttle and to **≤ 16 ms** unthrottled.

---

## 2. What happens on every keystroke

Measured on the 12-lesson ARES plan *Biology Grade 10: Animal Transport* (≈ 550 KB of JSON, 276 prose
textareas, ≈ 11,500 React component fibres on the page).

### 2.1 Every form-field subscriber re-renders to discover nothing changed

Payload's `useFormFields` / `useField` are built on `use-context-selector@2.0.0`. When the form state
changes, that library notifies **every** subscriber, and each one is re-rendered so its reducer can
compare its selected slice. React 19 cannot skip that render for a reducer update. The page has
**2,395 subscriber components (3,155 selector hooks)**. On a typical keystroke all 2,395 re-render; the
selected value actually changes for **6** of them (the edited field's own wrappers, plus Lesson3's
`LessonControls` and `EditJumpNav`, which subscribe to the whole form).

### 2.2 Every array-row label rebuilds the whole document, twice

Payload wraps every array row's label in `RowLabelProvider`
(`@payloadcms/ui/dist/forms/RowLabel/Context/index.js`). It reads `useWatchForm()`, a plain context
whose value changes on every keystroke, and on every render calls `getSiblingData(path)` and
`getDataByPath(path)`. Each of those unflattens the **entire** form state into a document. This plan
has **73 rows** (lessons, framework phases, final-explanation sections, summary-table and rubric
rows), so one keystroke triggers **≈ 146 full-document rebuilds**. React also has to walk the whole
fibre tree to find those 73 consumers of the changed context (`propagateParentContextChanges`).

This happens for every array row, with or without a custom label: Payload's default label is wrapped
too. Removing Lesson3's `RowLabel` would not help.

### 2.3 CPU profile (main, 37 keystrokes, unthrottled)

| Self time | Function | Where |
|---|---|---|
| 397 ms | `getDataByPath` | Payload form, called from `RowLabelProvider` |
| 278 ms | `getSiblingData` | Payload form, called from `RowLabelProvider` |
| 527 ms | two anonymous helpers and `unflatten` | the same document rebuilds |
| 178 ms | `propagateParentContextChanges` | React, finding the row-label consumers |
| 186 ms | `finishQueueingConcurrentUpdates`, `getRootForUpdatedFiber` | React, queueing 2,395 subscriber updates |

No layout reads or forced reflows happen during a keystroke; the cost is JavaScript only.

### 2.4 Smaller contributors (not the main cost)

- `LessonControls` and `EditJumpNav` use `useAllFormFields`, so they and their children (≈ 180
  components) re-render on every keystroke.
- Payload document locking (on by default, kept deliberately — DECISIONS 2026-06-08) refreshes the lock
  every ≥ 10 s of editing, which updates `DocumentInfo` and re-renders the whole edit view once.
- Collapsing lessons does not reduce the cost: collapsed rows stay mounted (276 textareas either way).

### 2.5 Checked and ruled out

- Edit recovery (drafts): its capture runs 8 s after typing stops, never during typing.
- Insert link (`LinkedTextarea`): its toolbar store only notifies on a change of active field.
- Field access functions and `admin.condition` on the server: trivial.
- Payload 3.92.0 (latest on 2026-10-23): the code behind §2.1 and §2.2 is unchanged — both prototype
  patch strings (§4) match its bundle as they are. Upgrading does not fix this.
- Payload 4.0.0-beta.4 (read, not run): still uses `use-context-selector@2.0.0` for form state, and
  `RowLabelProvider` still reads `useWatchForm()`. It now memoizes its two rebuilds, but on `fields`,
  which changes on every keystroke, so each row still rebuilds twice per key. The row-label code has
  changed shape, so §4's patch strings would need re-deriving on a 4.x upgrade.
- TypeScript 7 (7.0.2): speeds up type-checking, `next build`'s type-check step, CI and IDE feedback.
  It has no effect on this cost: types are erased and the browser runs the JavaScript Next.js emits.

---

## 3. Evidence

### 3.1 No regression across releases

Same database cloned per build, same plan, same script, alternated across two rounds:

| | v0.96 | v1.00 | main |
|---|---|---|---|
| Components re-rendered per keystroke | 2,611 | 2,577 | 2,577 |
| Main-thread time per keystroke (browser pane throttled, machine busy) | 255–510 ms | 248–297 ms | 223–358 ms |

The render counts are independent of machine load and settle the question; the timings were noisy
(see §3.3) but overlap.

### 3.2 Prototype patches

Headless Chromium (Playwright 1.64.1 in the `lesson3-e2e` image), production builds of `main`, real key
events typed at 120 ms intervals (37 keys), latency from the Event Timing API (`keydown` duration).

| Build | Median (1× CPU) | p90 | Worst | Median (4× slower CPU) | p90 | Worst |
|---|---|---|---|---|---|---|
| main | 56–64 ms | 64–88 | 80–152 | 224–256 ms | 304–376 | 528–568 |
| §4.1 subscriber fix only | 40 ms | 48 | 72–88 | 160–168 ms | 184–192 | 216–328 |
| §4.2 row-label fix only | 24 ms | 32 | 64 | 112 ms | 160 | 544 |
| **Both** | **≤ 16 ms** | 16–24 | 40 | **32–40 ms** | 48–72 | 104–184 |

Long-task time during the unthrottled typing run fell from 1,935–2,712 ms (main) to 130–144 ms (both).
Per-keystroke re-renders fell from 2,577 to 188 with the subscriber fix. The two fixes remove different
costs, so only the combination gives the large drop.

### 3.3 Method and caveats

- **Machine:** the operator's Apple Silicon Mac (8 cores) with other sessions' Docker workloads running
  (load average 4–7 throughout). Absolute numbers are therefore pessimistic; the comparisons were run
  back to back under the same load. §6 repeats them on a quiet machine.
- **Browser pane timings** (§3.1) come from the hidden in-app browser, which Chromium throttles; they
  are only good for comparing builds with each other.
- **Event Timing** reports only events ≥ 16 ms with 8 ms granularity, so "≤ 16 ms" means below the
  reporting threshold. In the 4× pass the first pass's observer was still attached, so each key was
  recorded twice; medians and percentiles are unaffected.
- **Signed in as Site Administrator**, so admin-only fields are rendered too. A Teacher with editing
  access sees fewer fields (structural fields are hidden by `structureCondition`), so their absolute
  cost is somewhat lower; the shape is the same.

---

## 4. Proposed fix

Both changes are to Payload's pre-built client bundle, `@payloadcms/ui/dist/exports/client/index.js`,
which inlines its own copies of `use-context-selector` and `scheduler`. An npm `overrides` entry
cannot reach them, which a first prototype confirmed.

### 4.1 Subscribers re-render only when their own selection changes

In the inlined `useContextSelector`, register a listener that compares the subscriber's latest selector
result with its last committed one **before** scheduling a re-render, instead of registering the bare
`dispatch`. The selector and its last result are kept in a ref updated in a layout effect after every
commit. Suspense and `useContextUpdate` actions, and any selector that throws, fall through to the
original `dispatch`, so behaviour is unchanged there.

Prototype: a single exact replacement of
`return Object.is(l[1],i)||a(),e2(()=>(s.add(a),()=>{s.delete(a)}),[s]),l[1]}`.

### 4.2 Row labels stop subscribing to the whole form

`RowLabelProvider` takes `getDataByPath` / `getSiblingData` from `useForm()` (stable; it always reads the
live form state through `contextRef`) instead of `useWatchForm()` (changes on every keystroke).

Prototype: one exact replacement of `{getDataByPath:r,getSiblingData:n}=bf(),` with
`{getDataByPath:r,getSiblingData:n}=Ge(),` inside `RowLabelProvider`.

**Side effect, measured:** when a row's label source is edited — for example a Subject Administrator
editing a lesson title — the label now catches up after the server form-state round-trip (within ≈ 3 s
of pausing) instead of on every keystroke.

### 4.3 Keep labels live in Lesson3's `RowLabel`

Lesson3's `components/RowLabel` already knows which field it displays (`clientProps.field`). It can
subscribe to exactly that value with `useFormFields(([fields]) => fields[`${path}.${field}`]?.value)`
(path from `useRowLabel()`), falling back to the provider's `data`. That restores live labels for every
Lesson3 array at the cost of one cheap selector per row, so §4.2's side effect disappears.

### 4.4 How the patch is applied and guarded

- One script (for example `app/scripts/patch-payload-ui.mjs`) applies both replacements. Each `from`
  string must match **exactly once** or the script exits non-zero, so a Payload upgrade that moves the
  code fails the install loudly instead of shipping unpatched.
- Run it from `postinstall`, so every `npm ci` gets it: the Dockerfile `deps` and `e2e` stages (the
  script must be `COPY`'d before `npm ci`, as only `package.json` and the lockfile are copied today),
  the `lesson3-deps` image used by `scripts/in-deps.sh`, and CI.
- A fast unit test (in the style of `tests/unit/vendorProvenance.spec.ts`) asserts that the installed
  bundle contains both patched markers, so a skipped `postinstall` fails the gate.
- Payload is already pinned to an exact version (CLAUDE.md "Knowledge currency"). On each deliberate
  upgrade, re-derive the patch strings; they apply unchanged to 3.92.0.
- **Scope:** admin client JavaScript only. No server code, schema, access rule, endpoint or migration
  changes, and the DOCX/PDF generator is untouched, so no golden-file or wire-test impact.
- **Rollback:** remove the `postinstall` line and rebuild.

### 4.5 Upstream

Report both problems to Payload with the measurements above: `RowLabelProvider` reading
`useWatchForm`, and `use-context-selector` re-rendering every subscriber under React 19. If Payload
fixes them, delete the local patch on the upgrade that includes the fix.

### 4.6 Later, optional

- Narrow `LessonControls` and `EditJumpNav` from `useAllFormFields` to the slices they need (≈ 180
  fewer re-renders per keystroke; small next to §4.1–§4.2).
- Revisit document locking only if the Rock numbers (§6) show its 10-second refresh matters.

---

## 5. Verification before merging

- The full browser suite (`test:e2e`) against a production build with the patch. The prototype only
  verified typing, a lesson-title edit and its label, and the server round-trip. Areas that lean on
  form state and must be covered: Save as new version, Save as draft, Discard changes, restoring a
  draft, Combine (conflict choices and overlay), adding / removing / reordering array rows, fields shown
  or hidden by `admin.condition`, validation messages, Insert link, and the jump navigation.
- `test:unit`, `test:int` and type-check as usual; the new patch-marker test in the gate.
- Re-run the typing benchmark (§3.2) on the final branch and record the numbers in DECISIONS.
- Consider committing the benchmark as a repeatable script so the next Payload upgrade can be checked
  the same way.

---

## 6. Later validation: the same benchmark on the Rock

The operator reports the Rock is usually idle, which makes it the right place for clean absolute
numbers, and it is reachable as `Rock5b` over Tailscale.

**What it measures.** Typing latency is spent in the **browser's** CPU, not the server's. Running
headless Chromium *on* the Rock (RK3588, ARM) measures a modest ARM CPU standing in for an inexpensive
school laptop, plus real server round-trips. It does not measure a teacher's own machine.

**How, without touching the live stack:**

1. Build `main` and patched production images on the Mac (ARM, same architecture as the Rock) and copy
   them over with `docker save … | ssh Rock5b docker load`, together with the `lesson3-e2e` image
   (≈ 4.6 GB, the largest transfer).
2. Start a separate Compose project (for example `lesson3-perf`) with its own Postgres, restored from
   the 12-lesson test dump, **no published ports**, and memory caps so the co-tenant (nanoclaw) is not
   starved.
3. Run the typing benchmark against each build, alternating, at 1× (the Rock's own CPU is the
   "slow laptop").
4. Tear down the project, its volumes and the copied images.

The live `lesson3` containers, volumes and database are never touched. This step needs the operator's
go-ahead when it is scheduled (it runs on the demo server).

---

## 7. Open questions for the operator

- **Q1.** Accept a guarded local patch to Payload's pre-built bundle (§4.4), or wait for an upstream
  fix? Recommended: patch now, report upstream.
- **Q2.** Implement §4.3 (live row labels) with the patch, or accept that a label follows a title edit
  only after a short pause? Recommended: implement §4.3.
- **Q3.** File the two upstream issues (§4.5) from the operator's GitHub account?
- **Q4.** When to run the Rock benchmark (§6): before implementation as a baseline, after, or both?
  Recommended: once on `main` as a baseline, then again on the finished branch.
- **Q5.** Include the optional `LessonControls` / `EditJumpNav` narrowing (§4.6) in the same PR, or
  leave it for later? Recommended: later.
