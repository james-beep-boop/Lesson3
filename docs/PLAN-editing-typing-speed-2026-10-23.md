# Plan — typing speed on the version edit page

**Status:** **implemented** on branch `perf/typing-speed-payload-patch` (2026-10-23), after Codex
approved this plan as written at `3f25375`, including the loop guard on §4.1's catch-up check. Results
and the two places implementation refined the plan are in DECISIONS 2026-10-23 "Patch Payload's admin
bundle for typing speed". Not deployed. Decisions are in §7.

**Second revision (2026-10-23, Codex's sign-off findings):**

- **P1, §4.1:** the patch adds a commit-time catch-up check. Selector notifications are no longer
  trusted to arrive after the selector is published.
- **P2, §5:** the behavioural tests now force a notification between render and commit.
- **P2, §4.4:** the idempotency check now requires the exact patched text.
- **P2, §4.5:** the benchmark confirms the keys were delivered before it counts a missing timing as
  fast.

**First revision (2026-10-23, after Codex's first review):** §4.1 now gives the full replacement code and the
argument for its safety under React 19; §4.3 gives the exact component change and how a cleared
value behaves; §4.4 adds the patch script to the dependency-cache hash; §4.5 fixes how the benchmark
reports keys below the Event Timing threshold; §5 adds behavioural checks beyond the patch markers;
§2.2 and §1/§3.1 correct two overstated conclusions; §6 names the Rock's actual co-tenant and the
bundle file; §7 records the decisions.

**Trigger:** the operator noticed that editing "used to be zippy, now it seems a little slow", while the
rest of the app still felt fast.

---

## 1. Summary

Typing into a prose field on a full-size lesson plan costs **56–64 ms per keystroke** on a fast Mac and
**224–256 ms** with the CPU throttled 4× (a stand-in for an inexpensive laptop, or a busy one). Nearly
all of it is spent inside Payload's admin form, not in Lesson3 code, and it scales with the size of the
plan.

**No regression was demonstrated.** Production builds of v0.96 (2026-10-12, before drafts, Combine
and the Payload 3.91 upgrade), v1.00 and `main` (`a5ef612`) re-render the same number of components per
keystroke, and their (noisy) timings overlap. That supports, but does not prove, that nothing got
slower. The likeliest reasons it *felt* faster before are a smaller plan being edited, or a less busy
laptop: during this investigation
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

### 2.2 Every array-row label scans the whole form state and rebuilds its row, twice

Payload wraps every array row's label in `RowLabelProvider`
(`@payloadcms/ui/dist/forms/RowLabel/Context/index.js`). It reads `useWatchForm()`, a plain context
whose value changes on every keystroke, and on every render calls `getSiblingData(path)` and
`getDataByPath(path)` (`payload/dist/utilities/`). Each of those walks **every key** of the flat form
state (thousands of keys on this plan), copies the keys under that row's path, and unflattens them
into the row's data — for a lesson row, a whole lesson. This plan has **73 rows** (lessons, framework
phases, final-explanation sections, summary-table and rubric rows), so one keystroke triggers **≈ 146
full scans of the form state, each followed by an unflatten of one row**. React also has to walk the
whole fibre tree to find those 73 consumers of the changed context (`propagateParentContextChanges`).

(An earlier draft said each call rebuilt the entire document. Codex's review corrected this: the scan
covers every key, but only the matching row is rebuilt. The profile in §2.3 is unchanged either way.)

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

### 3.1 No regression demonstrated across releases

Same database cloned per build, same plan, same script, alternated across two rounds:

| | v0.96 | v1.00 | main |
|---|---|---|---|
| Components re-rendered per keystroke | 2,611 | 2,577 | 2,577 |
| Main-thread time per keystroke (browser pane throttled, machine busy) | 255–510 ms | 248–297 ms | 223–358 ms |

The render counts are independent of machine load and show the same work per keystroke; the timings
were noisy (see §3.3) but overlap. Together they mean **no regression was demonstrated**; they are
not proof that none exists.

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
- **The percentiles in §3.2 are over reported keys only.** The script computes the median and p90 from
  the keys that crossed the 16 ms threshold, and prints `0` when none did. The runs above did not
  record how many of the 37 keys were reported, so the `main` medians may overstate the typical key
  somewhat; the long-task totals do not have this problem. For the patched build most keys fell below
  the threshold, which is why its median is given as "≤ 16 ms" rather than a number. §4.5 changes the
  script so this is explicit in its output, and the re-runs in §5 and §6 use it.
- **Signed in as Site Administrator**, so admin-only fields are rendered too. A Teacher with editing
  access sees fewer fields (structural fields are hidden by `structureCondition`), so their absolute
  cost is somewhat lower; the shape is the same.

### 3.4 Reproducing

The benchmark is `app/scripts/bench-typing.mjs`; its header lists the settings. It needs a throwaway
stack: a production image of the commit under test, its own Postgres, the local seed accounts and one
full-size ARES bundle (the numbers above used *Animal Transport* from the ARES JSON corpus, which is not
in the repo). From the repo root, building images one at a time:

```bash
docker build --target builder -t lesson3-bench-builder ./app
docker build -t lesson3-bench-app ./app
docker build --target e2e -t lesson3-e2e ./app
docker run -d --name lesson3-bench-pg -e POSTGRES_USER=lesson3 -e POSTGRES_PASSWORD=bench -e POSTGRES_DB=lesson3 postgres:16.15-alpine
# bench.env: DATABASE_URI=postgres://lesson3:bench@localhost:5432/lesson3, PAYLOAD_SECRET=<anything>, NODE_ENV=production
docker run --rm --network container:lesson3-bench-pg --env-file bench.env lesson3-bench-builder npx payload migrate
docker run --rm --network container:lesson3-bench-pg --env-file bench.env lesson3-bench-builder npx payload run scripts/seed-local-dev.ts
docker run --rm --network container:lesson3-bench-pg --env-file bench.env -v /path/to/bundle.json:/data/plan.json:ro lesson3-bench-builder npx payload run scripts/ingest.ts -- /data/plan.json
docker run -d --name lesson3-bench-app --network container:lesson3-bench-pg --env-file bench.env lesson3-bench-app
docker run --rm --network container:lesson3-bench-app -v "$PWD/app/scripts:/app/scripts:ro" -w /app lesson3-e2e node scripts/bench-typing.mjs
```

The ingested plan is version 2, the script's default. Every container shares Postgres's network
namespace, so `localhost` works for the seed script's guard and for the benchmark, and nothing is
published on a host port. Clear drafts between runs (see the script header). To compare builds, run
each build's app container against its own copy of the database and alternate between them.

---

## 4. Proposed fix

Both changes are to Payload's pre-built client bundle, `@payloadcms/ui/dist/exports/client/index.js`,
which inlines its own copies of `use-context-selector` and `scheduler`. An npm `overrides` entry
cannot reach them, which a first prototype confirmed. Every string below was checked against the
pinned **`@payloadcms/ui@3.91.0`** tarball (lockfile integrity verified by Codex): each search string
matches exactly once. They also match 3.92.0 unchanged.

### 4.1 Subscribers re-render only when their own selection changes

**The code today.** The inlined `useContextSelector` from `use-context-selector@2.0.0`, as it appears
in 3.91.0 (minified names kept, formatting added):

```js
function Xb(t, e) {                       // useContextSelector(context, selector)
  let o = CL(t)[uf],                      // CL = useContext
    { v: { current: r }, n: { current: n }, l: s } = o,  // r = value, n = version, s = listeners
    i = e(r),                             // this render's selection
    [l, a] = SL((c, u) => {               // SL = useReducer; l = [value, selection]; a = dispatch
      if (!u) return [r, i]
      if ('p' in u) throw u.p             // Suspense
      if (u.n === n) return Object.is(c[1], i) ? c : [r, i]
      try {
        if ('v' in u) {
          if (Object.is(c[0], u.v)) return c
          let d = e(u.v)
          return Object.is(c[1], d) ? c : [u.v, d]
        }
      } catch {}
      return [...c]                       // force a render
    }, [r, i])
  return Object.is(l[1], i) || a(), e2(() => (s.add(a), () => { s.delete(a) }), [s]), l[1]
}
```

`e2` is `useLayoutEffect` in the browser (`e2=RL?xL:wL`, `useLayoutEffect as wL`). On every value
change the provider sets its value ref, then calls every listener with `{ n, v }`. The listener is
the bare `dispatch`, so every subscriber gets a reducer update. React 19 cannot bail out of a reducer
update before rendering, so it renders all 2,395 subscribers to run their reducers and only then finds
that 2,389 of them are unchanged.

**Search string** (exactly once):

```
return Object.is(l[1],i)||a(),e2(()=>(s.add(a),()=>{s.delete(a)}),[s]),l[1]}
```

**Replacement**, inserted exactly as written. The comment is the marker the unit test looks for;
`Ub` is the bundle's alias for `useRef`, and `o` is the hook's own handle on the provider (`o.v.current`
is the provider's live value):

```
/*lesson3-patch:ucs*/let R=Ub(null);e2(()=>{R.current={e,s:l[1]};let v=o.v.current;if(!Object.is(v,r))try{Object.is(l[1],e(v))||a()}catch{a()}});return Object.is(l[1],i)||a(),e2(()=>{let L=u=>{if(u&&"v"in u&&!("p"in u)&&R.current)try{if(Object.is(R.current.s,R.current.e(u.v)))return}catch{}a(u)};return s.add(L),()=>{s.delete(L)}},[s]),l[1]}
```

The same code, readably:

```js
const R = useRef(null)
useLayoutEffect(() => {                                  // after every commit:
  R.current = { e, s: l[1] }                             //   publish the selector and committed selection
  const v = o.v.current                                  //   catch-up check (Codex P1): if the provider's
  if (!Object.is(v, r)) {                                //   value moved since this render read it,
    try { if (!Object.is(l[1], e(v))) a() }              //   re-check with THIS selector and render
    catch { a() }                                        //   if the selection differs or throws
  }
})
if (!Object.is(l[1], i)) a()                             // unchanged from the original
useLayoutEffect(() => {
  const L = (u) => {
    if (u && 'v' in u && !('p' in u) && R.current) {
      try {
        if (Object.is(R.current.s, R.current.e(u.v))) return  // selection unchanged: schedule nothing
      } catch {}                                              // selector threw: fall through
    }
    a(u)                                                      // otherwise exactly the original dispatch
  }
  s.add(L)
  return () => { s.delete(L) }
}, [s])
return l[1]
```

**Why it is safe under React 19.** The patch changes only *whether a render is scheduled*. Every
render that does happen still runs the original reducer and the original render-time check
`Object.is(l[1], i) || a()`. That check compares the reducer's selection with the selector applied to
the provider's *current* value, and if they differ it dispatches during render, which makes React
re-run the component before committing. So a committed render can never show a stale selection. The
only possible failure is a **missed** render: a committed selection that differs from the selector
applied to the latest value, with no update scheduled. Two mechanisms rule that out:

- **Notifications after the commit** are judged against the *published* selector and selection. A
  listener skips only when the selector applied to the new value equals the committed selection: the
  case where a render would produce what is already on screen.
- **Notifications between render and commit** (Codex P1) are judged by a listener that still holds the
  *previous* commit's selector. A change visible only to the new selector would be skipped. The
  catch-up check closes this window without relying on React's scheduling. At commit, the layout effect
  compares the value the render read (`r`) with the provider's live value. If they differ, it applies
  this render's selector to the live value and dispatches when the result differs from what was
  committed, or when the selector throws. This is the same idea as `useSyncExternalStore`'s post-commit
  consistency check, which this hook does not otherwise get.

**Why the catch-up check is gated on the value.** Codex's sign-off proposed comparing the selection
alone. That would loop forever for any selector that returns a new object on every call: the check would
fail, dispatch, re-render, fail again. Payload has such a selector: the Tabs field's
`useFormFields(([fields]) => tabs.map(…))` (corrected per Codex's sign-off; an earlier draft said an
Array field's `rows.map`). With the gate, the re-render reads the live value, so at
the next commit `r` equals `o.v.current` and the check does nothing. It costs one `Object.is` per
rendered subscriber per commit, plus a selector call only in the rare case that the value moved.
**This deviates from Codex's wording; Codex to confirm.**

Case by case:

| Case | Behaviour |
|---|---|
| Rapid successive updates (A → B → A′ while B's render is pending) | B dispatches. A′ is skipped if its selection equals the committed one. The pending render reads the provider's value ref, which already holds A′ (the provider updates the ref before notifying), so the render-time check corrects it to A′'s selection before commit. |
| Selector depends on props (for example `path`) | A props change re-renders the component through its parent, using the new selector. Codex's example: the selector switches from `a` to `b` and renders `b = 0`. Before the commit, a notification changes only `b`, to 1. The listener still holds `a`, sees no change, and skips. At commit, the catch-up check sees that the live value is not the one the render read, computes `b = 1`, and dispatches. §5 forces exactly this sequence. |
| Notification while subscribing (mount) | The listener is registered in a layout effect. A value change between the first render and that effect never reaches the listener, but the catch-up check in the same commit sees the moved value and dispatches. |
| Before the first commit | `R.current` is null, so the listener dispatches (original behaviour). |
| Unmount | The cleanup removes `L`, as the original removed `a`. |
| Suspense (`useContextUpdate(…, { suspense: true })`) | The action carries `p`, so it falls through to dispatch and the reducer throws the promise, as before. |
| Plain `useContextUpdate` | The action has no `v`, so it falls through; the reducer returns `[...c]` and forces a render, as before. |
| Selector throws on the new value | Caught; falls through to dispatch, whose reducer also catches and forces a render, as before. |
| Selector returns a new object every call | `Object.is` fails, so it dispatches: no change, and no benefit. |
| StrictMode double effects | The effect re-registers `L`; the `Set` holds one entry. |

**Cost.** One layout effect per *rendered* subscriber per commit (one `Object.is`, and a selector call
only when the value moved), and one selector call per subscriber per notification. The original already
made that call, inside the reducer, during render.

The prototype measured in §3.2 did not have the catch-up check. It adds work only for subscribers that
render, so the §3.2 figures should hold; the §5 benchmark re-run confirms this.

### 4.2 Row labels stop subscribing to the whole form

`RowLabelProvider` takes `getDataByPath` / `getSiblingData` from `useForm()` (stable; it always reads the
live form state through `contextRef`) instead of `useWatchForm()` (changes on every keystroke).

In 3.91.0, `Ge=()=>qs(df)` is exported `as useForm` and `bf=()=>qs(ff)` is exported `as useWatchForm`.
**Search string** (exactly once):

```
Qb=({children:t,path:e,rowNumber:o})=>{let{getDataByPath:r,getSiblingData:n}=bf(),
```

**Replacement:**

```
Qb=({children:t,path:e,rowNumber:o})=>{/*lesson3-patch:rowlabel*/let{getDataByPath:r,getSiblingData:n}=Ge(),
```

**Side effect, measured:** when a row's label source is edited — for example a Subject Administrator
editing a lesson title — the label now catches up after the server form-state round-trip (within ≈ 3 s
of pausing) instead of on every keystroke. §4.3 removes it.

### 4.3 Keep labels live in Lesson3's `RowLabel`

Lesson3's `components/RowLabel` already knows which field it displays (`clientProps.field`).
`useRowLabel()` also returns the row's `path`. The component subscribes to exactly that one field:

```tsx
const { data, path, rowNumber } = useRowLabel<Record<string, unknown>>()
const fieldState = useFormFields(([fields]) =>
  props.field ? fields[`${path}.${props.field}`] : undefined,
)
// A field present in form state wins even when empty, so clearing a title shows "Lesson N",
// never the old title. The provider's `data` is used only when the field is absent from form state.
const raw = fieldState ? fieldState.value : props.field ? data?.[props.field] : undefined
```

The selector returns the field's state object, which Payload replaces only when that field changes,
so under §4.1 each row re-renders only when its own label field changes. Reordering, adding or
removing rows changes `path`, and the row re-renders through its parent with the new path.
`formatRowLabel` already maps an empty or whitespace-only value to "<noun> N". This restores live
labels for every Lesson3 array and cancels §4.2's side effect. Only the value each label displays is
made live. The rest of the provider's `data` still updates only on the server round-trip, and no
Lesson3 label reads it for anything else. Payload's default label ("Row 01")
does not read row data, so it is unaffected.

### 4.4 How the patch is applied and guarded

- **One script**, `app/scripts/patch-payload-ui.mjs`, applies both replacements to
  `node_modules/@payloadcms/ui/dist/exports/client/index.js`.
  - Each search string must match **exactly once**, or the script exits non-zero. A Payload upgrade
    that moves the code then fails the install loudly instead of shipping unpatched.
  - Before replacing, it checks that the minified names mean what the replacements assume:
    `useRef as Ub`, `useLayoutEffect as wL`, `e2=RL?xL:wL`, `Ge as useForm`, `bf as useWatchForm`.
  - **Idempotent, by exact content (Codex P2).** The script holds each patch as a `{ from, to }` pair.
    For each pair:
    - `from` once and `to` absent: apply the patch;
    - `to` once and `from` absent: already applied, so leave it;
    - anything else is an error and the script exits non-zero.

    Anything else includes a marker present without the exact `to` text: an older revision of this
    patch, or a damaged one. Both pairs must end up applied; one applied and one not is an error. A
    future revision of the patch text therefore never silently accepts an earlier one that carries the
    same marker.
- **Run from `postinstall`** (`"postinstall": "node scripts/patch-payload-ui.mjs"`), so every `npm ci`
  applies it:
  - Dockerfile **`deps`** stage: `COPY scripts/patch-payload-ui.mjs ./scripts/` before `npm ci` (today
    only the manifests are copied). `builder` and `runner` inherit `node_modules` from `deps`.
  - Dockerfile **`e2e`** stage: the same `COPY` before its own `npm ci --include=dev`.
  - The **`lesson3-deps` image** (`scripts/in-deps.sh`) is built from the `deps` target, and CI builds
    every image from these stages, so both get the patch with no further change.
- **Dependency-cache hash (Codex P2).** `dev_deps_hash()` in `scripts/lib/dev-env.sh` hashes
  `package.json`, the lockfile, the Dockerfile and `.npmrc`. Add `app/scripts/patch-payload-ui.mjs`
  to its inputs. Otherwise a later fix to the script alone would leave the `lesson3-deps` image and its
  `node_modules` volume unpatched or stale.
- **Patched-content test:** a fast unit test, in the style of `tests/unit/vendorProvenance.spec.ts`,
  imports the script's `{ from, to }` pairs. It asserts that the installed bundle contains each exact
  `to` text once and neither `from`. A skipped `postinstall` then fails the gate, including one skipped
  by `ignore-scripts`: no install path in the repo sets that today, but npm configuration can. §5 adds
  the behavioural test.
- **Stale host packages.** On the operator's Mac, `app/node_modules` holds `@payloadcms/ui` **3.90.2**,
  but the repo pins 3.91.0; the search strings do not match 3.90.2. All checks run on freshly installed
  pinned dependencies (the refreshed deps container, or `npm ci`), never on that tree.
- Payload is already pinned to an exact version (CLAUDE.md "Knowledge currency"). On each deliberate
  upgrade, re-derive the patch strings; they apply unchanged to 3.92.0.
- **Scope:** admin client JavaScript, plus the three install files above and Lesson3's `RowLabel`. No
  server code, schema, access rule, endpoint or migration changes, and the DOCX/PDF generator is
  untouched, so no golden-file or wire-test impact.
- **Rollback:** remove the `postinstall` line and rebuild.

### 4.5 Benchmark reporting below the threshold (Codex P2)

`app/scripts/bench-typing.mjs` computes the median and p90 from reported keys only, and prints `0`
when none were reported.

**First, confirm the input arrived (Codex P2).** A missing timing may mean a fast key, or a key that
never arrived. Before the typing, each pass:

- attaches a `keydown` listener to the target textarea that counts the keys received;
- records the textarea's value and its caret position.

After the typing it checks two things:

- the count equals the number of keys sent;
- the textarea's value is the recorded value with exactly the typed text inserted at that caret.
  (`End` moves to the end of the caret's line in a multi-line textarea, not of the text.)

If either check fails, the pass reports the failure and the script exits non-zero, with no
percentiles.

**Then report.** Only after both checks pass may an unreported key count as below the threshold. Each
pass's output becomes:

- `keysTyped` (sent), `keysReceived` (counted by the listener), `keysReported` (Event Timing), and
  `keysBelowThreshold` (`keysTyped − keysReported`);
- `medianMs` and `p90Ms` over **all typed keys**, counting each unreported key as below 16 ms. A
  percentile that lands on an unreported key prints as the string `"<16"`, never `0`;
- `maxMs` as `null` when no key was reported.

`longTaskTotalMs` and `typingWallMs` are unchanged. The §3.2 figures predate this change (see §3.3).

### 4.6 Upstream

Report both problems to Payload with the measurements above: `RowLabelProvider` reading
`useWatchForm`, and `use-context-selector` re-rendering every subscriber under React 19. If Payload
fixes them, delete the local patch on the upgrade that includes the fix. The operator files these
(§7, Q3).

### 4.7 Later, optional

- Narrow `LessonControls` and `EditJumpNav` from `useAllFormFields` to the slices they need (≈ 180
  fewer re-renders per keystroke; small next to §4.1–§4.2).
- Revisit document locking only if the Rock numbers (§6) show its 10-second refresh matters.

---

## 5. Verification before merging

Patch markers prove the patch was applied, not that it is correct, so verification has four parts.

**1. The patch script** (unit tests against small fixture strings, not the real bundle):

- It exits non-zero on zero matches and on two matches of either search string.
- It exits non-zero when a name check fails (for example `useRef as Ub` absent).
- A second run is a no-op. It is an error when only one patch is applied, and when a marker is present
  without the exact `to` text (for example, an earlier revision of the patch).

**2. The patched hook's behaviour** (`tests/unit/payloadUiPatch.spec.tsx`; jsdom and
`@testing-library/react` are already dev dependencies):

- Load the inlined `use-context-selector` span from the **installed, patched** bundle, anchored by the
  same strings the patch script checks, and evaluate it with React 19.2.9.
- Run every case twice: against the patched span, and against the original (rebuilt by reversing the
  replacement). The settled visible values and the cleanup behaviour (listeners left registered,
  warnings) must be identical in both; only render counts may differ.
- **Forcing the render-to-commit window (Codex P2).** An ordinary `act()` batch that changes props and
  value together may never open this window, so the tests open it deliberately. A *notifier* component
  is placed as an earlier sibling of the subscriber. Earlier siblings' layout effects run first, so its
  layout effect runs after the subscriber has rendered but before the subscriber's own layout effects.
  That effect simulates a provider commit: it sets the provider's value ref to a new value and calls
  every registered listener with `{ n, v }`, as the provider does. The test arms the notifier only
  for the commit under test.
- Cases:
  - an update that leaves a subscriber's selection unchanged does not re-render it; one that changes it
    does;
  - rapid successive updates, in one batch and across batches (A → B → A, A → B → C), end with the
    correct committed selection;
  - **Codex's P1 sequence, forced:** the selector prop switches from `a` to `b`, and in the same commit
    the notifier changes only `b`, leaving `a` unchanged. The subscriber must settle on the new `b`.
    This test must **fail against the §3.2 prototype**, which had no catch-up check, and pass with §4.1.
  - the same with the notifier changing both `a` and `b`, and with it changing neither;
  - **updates during subscription setup:** the notifier fires during the subscriber's first commit,
    before its listener is registered;
  - **interrupted or abandoned rendering:** a subscriber update inside `startTransition` that a
    suspending sibling abandons, with a value change while it is pending; the settled value must match
    the original;
  - **switching context sources:** the subscriber moves from one provider of the context to another;
    later updates on the old provider do not touch it, and those on the new one do;
  - unmounting a subscriber removes its listener, and later updates neither touch it nor warn;
  - a throwing selector, a plain `useContextUpdate`, and a `suspense: true` update behave as unpatched;
  - a selector that returns a new object on every call settles without looping (the gate in §4.1);
  - under `<StrictMode>`, each subscriber has exactly one listener registered.

**3. The application, end to end:** the full browser suite (`test:e2e`) against a production build with
the patch. Areas that lean on form state and must be covered:

- Save as new version, Save as draft, Discard changes, and restoring a draft;
- Combine (conflict choices and overlay);
- fields shown or hidden by `admin.condition`; validation messages; Insert link; the jump navigation;
- rapid typing followed immediately by Save as new version stores exactly the typed text.

Explicit **live-label** checks (§4.3), as a Subject Administrator:

- typing a lesson title updates its row label on each keystroke;
- **clearing** the title shows "Lesson N", not the old title;
- after **adding**, **removing** and **reordering** rows, every label matches its own row.

**4. The usual gates:** `test:unit` (including the marker test), `test:int`, type-check, lint and
`format:check`.

Finally, re-run the typing benchmark (§3.4, with §4.5's reporting) on `main` and on the final branch
locally, and record the numbers in DECISIONS. Re-run it on each Payload upgrade too.

---

## 6. Later validation: the same benchmark on the Rock

The Rock is usually idle, which makes it the right place for clean absolute numbers. It is reachable as
`Rock5b` over Tailscale; SSH as `david` was confirmed on 2026-10-23. It is `aarch64` with 8 cores and
15 GiB of RAM, with 416 GB of disk free and a load average of about 0.1.

**When.** Once the candidate branch is ready, not before: benchmark unpatched `main` and the finished
branch **together**, alternating, under the same conditions. The `main` runs are the baseline. This is
outside the implementation PR.

**What it measures.** Typing latency is spent in the **browser's** CPU, not the server's. Running
headless Chromium *on* the Rock (RK3588, ARM) measures a modest ARM CPU standing in for an inexpensive
school laptop, plus real server round-trips. It does not measure a teacher's own machine.

**How, without touching the live stack:**

1. **Images.** Build production images of the two commits on the Mac (ARM, same architecture as the
   Rock) and copy them over with `docker save … | ssh Rock5b docker load`, together with the
   `lesson3-e2e` image (≈ 4.6 GB, the largest transfer).
   - The `lesson3-perf-*` images left on the Mac from the investigation may be reused **only after**
     confirming the revision each was built from and, for the patched ones, that the bundle inside
     contains both markers. Their presence alone does not show that they are the intended comparison.
2. **Stack.** Start a separate Compose project (for example `lesson3-perf`) with its own Postgres,
   **no published ports**, and memory caps.
   - Never touch the live services: `lesson3-app-1`, `lesson3-postgres-1`, `lesson3-gotenberg-1`.
   - Never touch the co-tenant: `onecli` and `onecli-postgres-1`.
3. **Data.** Migrate, seed and ingest as in §3.4, using
   `~/Desktop/ares-json/biology__grade_10__ss_3_2__animal_transport.json` (the *Animal Transport* plan
   behind §3.2), copied to the Rock for the run.
4. **Run.** Run `app/scripts/bench-typing.mjs` (with §4.5's reporting) against each build, alternating,
   with `BENCH_RATES=1` (the Rock's own CPU is the "slow laptop"). Clear drafts between runs.
5. **Tear down** the project, its volumes, the copied bundle and the copied images.

This step needs the operator's go-ahead when it is scheduled, because it runs on the demo server.

---

## 7. Decisions

Recorded 2026-10-23, from the operator's draft answers and Codex's two reviews:

- **Q1. Patch or wait?** Patch now, guarded as in §4.4. Codex approved implementation with four named
  changes, now folded in; the unrevised §4.1 patch was **not** approved. Upstream fixes, if any,
  replace the patch later.
- **Q2. Live row labels?** Yes: implement §4.3 with the patch.
- **Q3. Upstream issues?** The operator files them; not part of this work.
- **Q4. When to run the Rock benchmark?** Later, once the candidate is ready: `main` and the finished
  branch together, under the same conditions (§6). Not in the implementation PR.
- **Q5. Narrow `LessonControls` / `EditJumpNav`?** Deferred (§4.7).

- **Rock testing** is Claude's responsibility, with the operator's go-ahead when scheduled (§6).

**Still open:** Codex to confirm the one deviation from its wording, the value gate on §4.1's catch-up
check. Everything else is approved.
