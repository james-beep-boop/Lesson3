# One button system — plan (2026-07-30)

Source: operator review of the live lesson page and version editor at phone width (screenshots at
~390px), plus a GPT review of the first draft of this plan, which contributed three corrections
(§6). Everything here is **app-level with no migration**.

Goal, in one line: **one control geometry across both surfaces, with emphasis reserved for meaning.**

---

## 1. Grounding — what is actually there

Measured from source, not recalled. The operator counted four treatments; there are **nine**, because
there is no button system. `.page-back` is the only control with shared tokens (`--app-back-*` in
`app/src/app/app-tokens.scss`) — and it got them precisely so it could survive on both surfaces.
Everything else was styled where it was invented.

### Frontend — `app/src/app/(frontend)/styles.css`

| Control | Rule | What makes it different |
|---|---|---|
| Edit, Share ▾, Make Official, Request editing, Send | `.btn` :1241 | 6px radius, accent border/text, 0.9rem, weight **400**. **Never declares `background`** — so `<button class="btn">` inherits the UA `buttonface` gray while the one `<a class="btn">` (Guide donate) is transparent. The look the operator preferred is an accident of element type. |
| Compare | `.compare-link` :1293 | Same colours, but **inherits 1rem** and has thinner padding → reads larger. |
| ★ Favorited | `.fav-toggle--labeled` :849 | **999px pill**; label 0.9rem but the ★ glyph inherits **1.1rem** from `.fav-toggle` (1.35rem ≤640px) → rounder and larger. |
| 2 versions ▾ | `.versions-chip` :641 | 999px pill, **muted gray** text, 0.8rem. |
| PDF / Word downloads | `.btn.btn-doc` :600 | Deliberately neutral-until-hover (D4, critique 2026-07-12): blue is reserved for selected state and primary actions, so catalogue downloads stay quiet row furniture. **This decision is kept.** |
| ← Back to lesson plans | `.page-back` :1030 | 6px radius, accent, but **16px / weight 600** → darker and heavier than its neighbours. |

### Editor — `app/src/app/(payload)/custom.scss`

| Control | Rule | |
|---|---|---|
| Official version | `.lesson-controls__official` :687 | Filled 999px pill on a success token. It is **status**, shaped like an action; at narrow widths its text wraps left-aligned inside the pill. |
| Quick preview ↗ / Formatted PDF ↗ / Show details / Editing help / Cancel | Payload stock `<Button buttonStyle="secondary" size="small">` | Payload's own radius, typography and 15px rem root — the "another look entirely" in the operator's report. |
| Edit / Save | Payload stock `primary` | |
| Delete | `.btn--style-error` override :648 | Danger outline, already app-styled. |

---

## 2. The system

**One geometry for every control in the system**, from shared tokens: radius, min-height (38px, 44px
at ≤640px for WCAG 2.5.5), padding, gap, font size, font family, focus treatment.

"In the system" is a real boundary, not a figure of speech: the page-level and row-level action
controls on the lesson page, the catalogue and the version editor. Form submits, the Messages
compose controls and the Share menu's flat list items stay outside it — see §5a for the list and why.

Tokens go in `app-tokens.scss` as `--app-btn-*`, generalising the existing `--app-back-*` set. Font
size is stated in **px**, for the same reason Back already is: the admin root is 15px and the
frontend's is 16px, so a `rem` token would render ~6% smaller in the editor.

**Emphasis carries meaning, and nothing else.** Four variants:

| Variant | Background | Border | Text | Weight | Used for |
|---|---|---|---|---|---|
| **Standard** | `--bg-soft` | accent | accent | 400 | Edit, Share, Compare, Back, Favorite, Quick preview, Formatted PDF, Show details, Editing help, Cancel, Request editing |
| **Primary** | accent | accent | `--accent-ink` | **600** | Save (today the only primary) |
| **Quiet** (`--quiet`) | `--bg-soft` | `--line` | `--ink` | 400 | Catalogue downloads, versions chip, subject/grade filters |
| **Danger** (`--danger`) | `--bg-soft` | red | red | 400 | Delete (today the only danger) |

**Status is not a variant.** Plain emphasised text — no border, no background, no button shape, and
the same colour on both surfaces (bold ink; see §3).

Note the standard variant *does* carry the soft-gray fill — so the distinguishing mark of primary is
a filled **accent** background, not "a background".

### 2a. Every state, specified

The variants above are the **default** state. A system that stops there is how the current
inconsistency happened, and the soft-gray background raises the stakes on disabled in particular:
dimming accent-on-gray with `opacity` muddies contrast instead of reading as "off".

| State | Treatment | Notes |
|---|---|---|
| **Default** | Per the variant table | |
| **Hover** | Standard / primary / danger **fill** with their own colour, text → `--accent-ink`. **Quiet does not fill** — it promotes to the accent outline | Filling quiet would put a solid block under each of six download pills per catalogue row, which is exactly the visual competition D4 removed. `--line` as a background with white text would also fail contrast outright |
| **Focus (keyboard)** | The hover fill **plus** `outline: 2px solid var(--app-accent); outline-offset: 2px` | The codebase currently pairs `:hover, :focus-visible` in every rule, so a keyboard user gets the fill and nothing else — indistinguishable from a moused-over control. The offset ring separates them. `:focus-visible`, not `:focus`, so pointer users never see it |
| **Selected, in a set** (`.is-active`) | **Fills** with accent, weight stays 400 | A mutually exclusive group where exactly one member is on: the subject/grade filters. A segmented control needs an unmissable current choice, and D4 reserved blue for precisely this meaning. Filled **and** 600 still means primary; filled alone means selected. Keyed to `.is-active`, **not** `[aria-pressed]` — Favorite sets that attribute too (below) |
| **Toggled** (`aria-pressed`) | Border and geometry unchanged; the **icon** takes the accent fill and the label changes (Favorite → Favorited) | Deliberately *not* a background fill — see the Favorite decision below. `aria-pressed` remains the semantic source of truth; the coloured star is reinforcement only |
| **Pressed** (`:active`) | **Not styled.** Hover and focus already give feedback with a pointer or a keyboard | Called out because it is a genuine gap, not an oversight: on touch there is no hover, so a tap currently has no press feedback. Worth adding, but it is new behaviour rather than a consistency fix, so it is not in PR A. Do not confuse this transient state with the toggled state above — they were one row in an earlier draft |
| **Disabled** | `--app-btn-quiet-line` border, `--app-btn-disabled-ink` text, background retained, `cursor: default`, **no hover fill** | Explicit, not `opacity`. `#666` on `#f6f7f8` is ≈5.4:1 — passes AA while reading inert. ⚑ Scoping matters as much as the rule: `.fav-toggle:disabled { opacity: .5 }` had to become `.fav-toggle:not(.btn):disabled`, because `.btn:disabled` declares no `opacity` and so cannot override it — the labelled favorite was getting the explicit palette *and* 50% opacity, stacked. Pinned by a test (§5) |
| **Busy** | As disabled, plus `cursor: progress` | Real and currently unstyled: `pdfBusy` → "Preparing document…", `saving` → "Saving…", `FavoriteToggle`'s `busy`, ShareMenu's. The label already carries the explanation, so the visual only needs to say "not right now" |

Disabled and busy are the same visual on purpose — both mean "unavailable", and the distinction that
matters to the user is already in the label.

**Selected ≠ toggled, and the split is deliberate.** A filter fills its background; Favorite fills
only its star. Favorite is one optional switch sitting among more consequential actions, so filling
it would overstate it — whereas for a filter set, the selection *is* the point. Both controls carry
`aria-pressed`, which is why the selected fill is keyed to a class: an attribute selector would fill
the one control we deliberately kept unfilled. Pinned by a test.

### 2b. Two densities

Emphasis is one axis; **size is a second, independent one**. `--compact` keeps the radius, colours,
focus ring and disabled treatment exactly, and changes only min-height, padding and font size.

| Density | Tokens | Used for |
|---|---|---|
| **Page-level** (default) | `--app-btn-*` | Lesson-page and editor bars: Edit, Share, Compare, Back, Favorite, previews, help, Save |
| **Compact** (`--compact`) | `--app-btn-compact-*` | In-row furniture: catalogue download pills, the catalogue's versions chip, the Share menu's per-document pills |

The compact values are today's rendered `.btn-doc` metrics restated in px, so the catalogue does not
move. It exists because six page-level controls per row, down a long list, would swamp the catalogue
— but a density is not a different control, which is why it shares everything else.

⚑ **Compact is a desktop density only.** At ≤640px every button, compact included, takes the 44px
touch target: the catalogue row is a stacked card with room, and exempting compact would reintroduce
exactly the 26–40px targets the 2026-07-05 audit flagged.

`VersionsChip` renders at both densities, so it takes an explicit `compact` prop. Reviewers proposed
deriving it from the catalogue's `.substrand-versions` ancestor instead; rejected — that is not
derivable inside the component, and it would make a third call site under a different wrapper get
the wrong density silently, with no type check.

### Decisions inside the system

**Background: `--bg-soft` (#f6f7f8), declared explicitly.** Operator choice from the live
screenshots. The point is that it is *declared* — the current dependency on UA button styling is
what makes `<a class="btn">` and `<button class="btn">` disagree today. GPT argued for white so that
fill is used *only* for emphasis; at #f6f7f8 the tint is light enough not to compete with a filled
primary, and it gives a pressable cue that a bare outline does not — which is worth something on the
low-cost screens this audience uses. One token to reverse if it reads wrong on the Rock.

**Weight 400 standard / 600 primary.** The first draft of this plan proposed a blanket 600 and was
wrong (§6). `.btn` sets no weight, so Edit and Share — the two controls the operator named as the
target — are 400. Matching them means bringing Back *down* from 600, not levelling everything up; a
page of 600-weight controls would be louder on a phone than the inconsistency being fixed.

The rule is **"primary buttons use 600"**, scoped to this button system — not "Save is the only
600-weight thing in the app". Save is today's only primary; a future primary inherits the weight
without anyone having to revisit this decision, and headings elsewhere are unaffected.

**Favorite is a standard button whose ★ fills, not a filled button.** Same outlined shape as its
neighbours; when favorited the star takes the accent colour and the label reads "Favorited". A
filled-accent Favorited would give a minor preference action more visual weight than Edit and Share,
which are more consequential. The filled star also agrees with the catalogue rows, which already
signal favorite state exactly that way — one fewer pattern, not one more.

`aria-pressed` stays the **source of truth** for the selected semantics (it is already wired); the
coloured star and the label change are visual reinforcement layered on top, never the only signal.

*Not doing:* icon-only Favorite at narrow widths. `FavoriteToggle` carries `labelOnMobile` precisely
because a bare star is **most** ambiguous on touch, and the lesson page passes `showLabel` because
the bare glyph was easy to miss. Going icon-only on phones reverses a decision made from the same
evidence.

**Back reads `← Back`** on every surface, with the destination preserved in `aria-label` ("Back to
lesson plans" / "Back to lesson" / "Back to sign in"). The two surfaces go to different places and
now read identically; the accessible name keeps the distinction where it is load-bearing, and the
shorter label is the widest control in a narrow bar.

**`.btn-doc` → `.btn--quiet`.** The quiet variant is no longer document-specific once the versions
chip uses it, so the name would be a lie. Renaming touches 2 call sites and 4 selectors.

---

## 3. PR A — the button system (presentation only)

**`app/src/app/app-tokens.scss`** — `--app-back-*` become `--app-btn-*` (radius 6px, min-height 38px
/ 44px touch, padding 6/12, gap 6px, font-size 15px, weights 400/600). `.page-back` stops being a
special case.

**Frontend (`styles.css`)**
- `.btn` rebased on the tokens with `background` **declared**, so `<a>` and `<button>` finally match.
- `.btn--primary`, `.btn--quiet`, `.btn--danger`. **No `--back` modifier**: an earlier draft planned
  one for the `←` gap, but the base rule's `gap` already spaces the arrow from its label, so the
  modifier would have been a dead rule. Back is a plain `.btn`.
- **Deleted:** `.compare-link`, `.versions-chip`, `.page-back`, `.btn-doc` and their ≤640px
  counterparts. Those controls become `.btn` + a modifier.
- **`.fav-toggle--labeled` survives, reduced.** Its pill geometry goes, but the selector stays as the
  hook for the parts that are genuinely star-specific: the ★ glyph's size and its accent fill when
  favorited, including flipping to `inherit` under the hover fill so it is not accent-on-accent.
- `.substrand-versions` reserved column (6.5rem) re-measured — the chip becomes a full-height button.

**Editor (`custom.scss`)** — override `.collection-edit--lesson-bundle-versions .btn` onto the same
tokens, mapping Payload's `--style-primary` / `--style-secondary` / `--style-error` to primary /
standard / danger. Quick preview, Formatted PDF, Show details, Editing help, Save and Cancel fall in
line while keeping the `Button` component's tooltip, disabled and aria behaviour. Precedent: the
`.page-back` block at :856 already proves unlayered app rules beat Payload's `@layer` styles without
`!important`.

`.lesson-controls__official` loses its pill — **both states**. `--is` becomes bold **ink**; `--not`
becomes muted, lighter text. Fixing only the Official case would leave the neutral chip as the last
pill standing and the two states looking like different kinds of thing.

⚑ **Ink, not green and not accent.** Three answers were briefly in play: the frontend's shipped
`.official-tag` is bold `--ink`, the first implementation of this plan used the admin's green
success token, and an earlier draft of this document said "accent". Ink wins — green reads as
"success", which Official is not (it means "this is the authoritative version", not "something went
well"), and accent would make a read-only marker compete with the real actions beside it. The admin
uses `--theme-elevation-1000`, its equivalent of `--ink`, so the same status now looks the same on
both surfaces.

**Components** — `PageBackLink` (label + `aria-label` + class), `VersionsChip`, `FavoriteToggle`,
`DocButtons`, the lesson page's Compare link, `LessonControls`' Back.

**Scope fence: PR A is purely presentational.** It changes how controls look, never which controls
render or what they do. The ≤640px notice (`.lesson-controls__edit-unavailable`,
`.lesson-edit-unavailable`) and the rules that hide Edit at that width are **left exactly as they
are** — they belong to PR B in full. PR A touches no `.tsx` logic, only class names, the Back label
and its `aria-label`.

---

## 4. PR B — narrow-screen editing explains itself

Edit stays rendered at every width. At **press time** it checks `editingAvailableAtWidth(window.innerWidth)`
and opens a dialog instead of entering edit mode:

> **Editing needs a wider screen.** You can still view this lesson here. To edit, rotate your
> device, widen the window, or open the lesson on a larger screen.

One **Got it** button. Deliberately no enumeration of sharing, previewing and downloading: naming
them would imply they were in doubt. "You can still view this lesson here" is the correction the
current string needs — it names the remedy but never says the page is otherwise useful.

**The standing notice comes out** — `.lesson-controls__edit-unavailable`, `.lesson-edit-unavailable`,
and both ≤640px hide/reveal rules. That retires the layout-overlap class that #165, #166 and #167
each chased: the notice text was the thing competing for space in the bar.

**The mount guard stays.** `editingAvailableAtWidth` in `LessonControls` is what *implements* the
feature (DECISIONS 2026-07-29); the CSS was only ever cosmetic. Nothing about the authorization or
the ≤640px view-only decision changes.

Not a repeat of the pre-#155 bug: that Edit button appeared to work and silently didn't (the form
stayed locked). This one is honest — it never claims to enter edit mode.

---

## 5. Verification

Per PR: `tsc` clean, `test:unit` green, eslint with no *new* errors, CI `gate` green. `main` is
protected — PR required. No migration anywhere in this batch; if one appears, stop.

String-pinned tests that needed updating (this is the tests working, not noise):
`app/tests/unit/pageBackLink.spec.tsx`, `app/tests/unit/lessonControlsSsr.spec.tsx`,
`app/tests/e2e/manage.e2e.spec.ts` — all pinned `class="page-back"` and/or the full Back label.

**New: `tests/unit/buttonSystem.spec.ts`** pins the three cascade facts the system rests on, none of
which are visible in review or catchable by `tsc`:

1. `.btn` **declares** `background` — the original defect was that it didn't, so `<button>` and `<a>`
   rendered differently.
2. Modifiers stay **doubled** (`.btn.btn--quiet`, 0-2-0). The Share menu deliberately flattens `.btn`
   via `.share-menu button` (0-1-1); the download pills survive only by outranking it, exactly the
   contest the former `.btn.btn-doc` won. A single-class modifier loses it silently.
3. Source **order** decides two equal-specificity contests: `.btn` after `.fav-toggle` (both 0-1-0),
   and `.btn:disabled` after `.btn.btn--primary` (both 0-2-0), so a disabled Save is not still filled.

Plus: no orphaned `.compare-link`/`.page-back`/`.btn-doc` selectors, no `opacity`-based disabling, a
focus rule distinct from hover, and every `var(--app-btn-*)` reference resolving to a real token.

It asserts against the **stylesheet source**, not a DOM: jsdom's CSS engine cannot expand a
shorthand whose value is a `var()`, so a computed-style probe measures jsdom's limits rather than
ours (tried first, discarded). Specificity and order are decidable from source and are the fragile
part. Parsing is `postcss` (already a direct dependency) rather than a brace-matching regex — the
stylesheet nests rules inside `@media`, and a regex that cannot see nesting flattens those into the
same list, leaving every lookup dependent on an unwritten "the real rule happens to come first"
invariant. Verified non-vacuous by mutation — demoting `.btn.btn--quiet`, deleting the `background`
declaration, and unscoping `.fav-toggle:not(.btn):disabled` each fail it.

One check is deliberately **not** source-level. Asserting that `.btn:disabled` declares no `opacity`
is too narrow, and that narrowness is not hypothetical: it passed while the labelled favorite was
being dimmed by a *different* rule that still matched it. The guard now builds the four real
disabled/busy DOM shapes and asserts no `opacity`-declaring rule matches any of them, via jsdom's
`Element.matches()` — selector matching, not computed styles, so the jsdom limitation above does not
apply.

**Acceptance is visual, not lint.** Confirmation is an eyeball at **390px, 550px, 700px unmaximised,
and desktop** — the widths already listed as pending in `docs/NEXT-SESSION.md`.

Do it **after merge and deploy**, on the Rock — not against the staged tree. (Noted 2026-07-30: the
old "`next dev` hangs on the dev Mac" blocker is stale — it starts and serves. What stops a local
check now is that every route needs Postgres and the connection string names the compose service, so
routes 500 with `ENOTFOUND postgres` until that container is up. Worth fixing; it would move UI
verification off the post-deploy critical path for good.)

What to check:

- Every control in the lesson-page and editor bars shares one height, radius and text size.
- Nothing except Save carries a filled **accent** background (every button carries the soft gray).
- **Official *and* Not Official** both read as status text, not as pressable controls, and Official
  is the same bold ink in the editor as on the lesson page.
- Favorited shows a filled star inside an ordinary outlined button.
- **Disabled reads as unavailable, not as faded** — check Save on a pristine form, and Formatted PDF
  mid-render ("Preparing document…").
- **Keyboard focus is visible and distinguishable from hover** — tab through the bar on both
  surfaces.
- PR B: at ≤640px Edit is present, pressing it opens the dialog, and no standing notice occupies the
  bar.

---

## 5a. Deliberately out of scope — three more hand-rolled controls

Found while doing PR A, on pages the operator's report did not cover. Left alone rather than
silently widening the change; each is the same problem on a different surface:

| Control | Where | What it is |
|---|---|---|
| `button[type='submit']` | login, signup, reset, EmailModal | Filled accent, 1rem, no border — a second primary treatment. Its attribute selector (0-1-1) **outranks** `.btn` (0-1-0), so `EmailModal`'s `<button type="submit" class="btn">` renders as this, not as a system button |
| `.msg-compose-open` | Messages | Hand-rolled outline button, near-identical to `.btn` but with its own padding and `0.9rem` |
| `.msg-compose__send` | Messages | Hand-rolled filled primary, weight 600, `opacity: 0.55` when disabled |

Folding these in is a small follow-up (mostly deleting rules and adding `.btn btn--primary`), but it
touches the auth and messaging pages, which are not what this batch is about and would need their own
visual pass. The `opacity`-based disabled states there are the same accessibility issue §2a fixed for
buttons. Worth doing; not worth doing blind.

---

## 6. Corrections applied to the first draft

From two review rounds, all accepted:

**Round 1 (GPT):**

1. **Blanket weight 600 was wrong.** Back is already too heavy; levelling everything up would make
   the whole page louder. Now 400 standard / 600 primary (§2).
2. **Favorite should not be a filled blue button** — too much prominence for a minor preference
   action. Now an outlined button with a filled star (§2).
3. **The dialog should say viewing still works**, not only name the remedy (§4).

**Round 2 (operator, adopting the review's refinements):**

4. **Every state must be specified, not just default and hover** — the largest gap in the draft, and
   the soft-gray background makes disabled the hard case. New §2a covers default, hover, keyboard
   focus, pressed/toggled, disabled and busy, and replaces `opacity`-based disabling.
5. **Scope the weight rule to the system:** "primary buttons use 600", not "Save is the only
   600-weight thing in the app" (§2).
6. **Both Official states become text**, not only `--is` — otherwise the neutral chip is the last
   pill standing (§3).
7. **`aria-pressed` is the source of truth** for Favorite; the coloured star is reinforcement (§2).
8. **PR A stays purely presentational** — the narrow-screen dialog and the standing notice's removal
   belong to PR B in full. Scope fence stated in §3.
9. **Shorter dialog copy** — enumerating share/preview/download would imply they were in doubt (§4).

Two round-1 points not adopted, with reasons: icon-only Favorite at narrow widths (§2, reverses a
decision the codebase already made from the same evidence — the operator agreed on round 2), and a
white button background (§2, the operator chose `--bg-soft` from the live screenshots; noted as
one-token reversible).

Round 1 also flagged that the four operator decisions behind this plan appeared unsupported — they
were made through an options prompt that does not survive a copied transcript. No change.
