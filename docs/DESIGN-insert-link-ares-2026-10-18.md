# Insert link for ARES — brief (2026-10-18)

**Status:** approved by the operator 2026-10-18. Build **after Combine 3b merges** — both touch the
editor toolbar in `components/LessonControls/index.tsx`. Two changes, reviewed separately:
**Plan A** (the editor) and **Plan A+** (online rendering). Plan B is recorded at the end and is not
part of this work.

---

## Why this exists

Insert link (SPEC §5, "Proof of concept — links inside prose", 2026-08-22) was built against the
Rock: type an `https://` address, or pick a PDF from a folder on the Rock. Lesson3's real home is
different:

- **It will mainly run on local ARES machines in schools, never used from home. An online version
  will come later.** (Operator, 2026-10-18.)
- **ARES content is not in a folder Lesson3 manages.** A scan of all 95 ARES plans
  (`/tmp/ares-scan-tools/links.py`; 6,850 resource links) found every link points at the school
  machine's name, `ares.local`, over plain `http`:

  | Share | Shape | What it is |
  |---|---|---|
  | 95% (6,536) | `http://ares.local:8069/en/learn/#/topics/c/<32-hex id>` | a Kolibri catalogue item (Khan Academy, CK-12, …) |
  | 5% (314) | `http://ares.local/modules/<module>/…` (`.html`, `.mp4`, `.pdf`, `.htm`) | files in ARES's `/modules/` folders: PhET, Seavuria videos, Practical Action and IICBA PDFs |
  | fallbacks | `http://ares.local/www2/search.php?searchstring=…&sources[]=…` | ARES's search page |

  Prose itself holds almost no links (4 in the whole corpus).
- **ARES's published lesson PDFs use the same `ares.local` links** (one sample PDF on
  `demo.aresedu.dev`: 322 links, all `ares.local` / `ares.local:8069`). They work on a school network
  and go nowhere from the internet.
- On `demo.aresedu.dev`, Kolibri is mounted at `/kolibri/` (at schools it listens on port 8069), and
  ARES's own menus link through a usage tracker:
  `/tracker/local_launch.html?module_id=…&target=<url-encoded path>` (local) and
  `/tracker/external_launch.html?module_id=…&target=<url-encoded absolute URL>` (external).

**Defect today:** `validExternalUrl` (`components/LinkedTextarea/insertLink.ts`) accepts only
`https:`, so a teacher who pastes any ARES link is refused with "Enter a complete https:// web
address." The generator side (`generator/proseLinks.ts`) already accepts `http` and `https`.

---

## The rule both plans rest on

**Links are stored in ARES's own form — `http://ares.local/…` and `http://ares.local:8069/…` — and
translated, if at all, only when a document is generated.** One stored form, whichever machine the
lesson was edited on, identical to the links ARES itself writes into `resourceLinks`. Stored data is
never rewritten; versions, Combine and edit recovery are unaffected.

---

## Plan A — the editor

1. **Accept `http` and `https`** in the Internet-address box; anything else is still refused. New
   message: "Enter a complete web address starting with http:// or https://."
2. **Offer Insert link only in the four framework columns:** Learner experience, Teacher moves,
   Sensemaking strategy, Formative assessment (`FRAMEWORK_PROSE`). Today `prose()` in
   `fields/bundleFields.ts` makes every prose field except `title` linkable; make linkability opt-in
   and opt those four in. **Rendering does not change:** `withParenthesizedProseLinks` keeps
   linkifying every field it does today, so links already stored in other fields stay clickable.
   Teachers can still type a parenthesized address anywhere; only the button is narrowed.
3. **Hide the button while the Combine review is open.** Its "Write my own" box is not a linkable
   field, so the button could only ever be disabled there. In the editor it keeps today's behaviour
   (rendered only while editing; disabled with "Place the cursor in a prose field first" until the
   cursor is in a linkable field — reword to "…in Learner experience, Teacher moves, Sensemaking
   strategy or Formative assessment" or similar; list the wording for approval).
4. **Optional label.** A second box, "Label (optional)". With a label the insertion is
   `Label (http://…)`; without, today's `(http://…)`. Plain text — no markup, so the editor grammar
   rule holds. Trim it, refuse a newline, cap the length (e.g. 120 characters); parentheses in the
   label are harmless (only `(http…` starts a link) but test that.
5. **Convert pasted ARES addresses to the stored form before inserting.** A pure function
   (unit-tested; no network) applied to the typed address:
   - **Unwrap the tracker** (operator decision: store the plain address). `local_launch` →
     `http://ares.local` + the decoded `target` path; `external_launch` → the decoded `target` URL,
     then normalised again by the rules below. A malformed or missing `target` leaves the address as
     typed.
   - **Match known bases exactly**, by origin (including port) and a whole path prefix. The
     configured `ARES_SITE_URL`/`ARES_KOLIBRI_URL` prefixes are removed before insertion. The longest
     matching prefix wins, so a specific site prefix is not swallowed by pathless Kolibri on the
     same origin. Kolibri wins equal-prefix ties. Defaults recognize HTTP/HTTPS ARES/demo roots,
     port 8069 and the demo `/kolibri` prefix. Host aliases add normal site ports and 8069, not
     arbitrary ports: `ares.local:8082` stays unchanged unless explicitly configured as a base.
   - Verify a resolved local tracker target remains on the wrapper's origin and inside a known base.
     TAB, newline and backslash tricks must not produce an external URL.
   - Other addresses receive ordinary URL syntax normalization but no ARES rewrite. The shared
     parser normalizes accepted HTTP/HTTPS addresses before storing them.
   - ⚑ `ares.edu` appears as a host in some demo menu targets (e.g. `ares.edu:8082`, a file-share
     service). Do **not** treat it as an alias by default; ask the operator if it should be.
6. **The Rock PDF folder becomes opt-in.** It has no counterpart on an ARES machine (ARES's PDFs
   live in `/modules/` and are linked like any other ARES address). Show the "PDFs on the Rock"
   section only when `PDF_LIBRARY_DIR` is set and the folder is readable; leave the endpoints and
   their tests in place. Change `.env.example` so the folder is commented out by default, and say so.
   **Serving a listed PDF no longer requires signing in** (operator, 2026-10-18: a PDF link in a
   document must work for someone without an account). Only `GET /api/resource-library/file/:token`
   becomes public; the listing endpoint stays authenticated, and every existing file check (flat
   folder, no symlinks, `.pdf`, exact first-byte `%PDF-` signature, size cap, `nosniff`) stays. This is an authorization
   change: update the wire tests in the same PR (anonymous file fetch 200; anonymous listing still
   401; a bad token still 404). Oversized files also return 404. Stream the verified file instead of
   reading the entire body into memory. `docker-compose.test.yml` mounts the committed valid PDF
   fixture read-only so these wire cases run in CI without conditional skips.
   **Approved 2026-10-18:** configured PDF files are public independently of public discovery;
   listing stays authenticated and unset `PDF_LIBRARY_DIR` returns file 404. The operator approved
   the complete proposed wording before implementation. `PUBLIC_LIBRARY_ENABLED` still gates
   lesson discovery; `SERVER_URL` still controls the existing security posture. Internet hosts
   continue to follow `docs/OPS.md`'s Going public checklist.

7. **Fix the help text**, which still says the button is "beneath a text field" or offers "a PDF
   from the Rock": `app/src/app/(frontend)/guide/page.tsx` (~line 428), `USER_GUIDE.md` (~line 228),
   and the editor's Help dialog in `LessonControls/index.tsx` (~line 1064).
8. **A "New feature" note at the top of the dialog — not a badge on the button.** Operator,
   2026-10-18: the feature still feels experimental, but "(beta)" on the toolbar would crowd a row
   that already had to be fixed for wrapping, and is jargon to many teachers. The button stays
   "Insert link". The dialog opens with a short note, proposed wording (list it for approval with
   the other strings):

   > **New feature.** Paste an address from ARES or the web. It is added to the text in brackets
   > and becomes a clickable link in the Word and PDF documents. Tell your administrator if a link
   > does not work.

   ⚑ **Removal condition, decided now so the note does not stay forever:** remove it once Plan A has
   been used in a school for a term with no link problems reported. Record the removal in DECISIONS.

**Tests.** Unit: the normaliser (each tracker form, ARES host/alias/Kolibri rewrite, a non-ARES
address untouched, malformed input), `validExternalUrl` for `http`, the label insertion. Browser:
the button is enabled only in the four columns; pasting an `http://ares.local/…` address and a
tracker-wrapped address inserts the stored form; the label form; the "New feature" note shows in the dialog; the button is absent during the
Combine review; the PDF section absent when unconfigured. Wire: the PDF file endpoint's new public
access as described in step 6, alongside its existing 404 cases; no other endpoint changes.

**Docs.** SPEC §5's links section (rewrite the POC paragraph around the stored-form rule), the
Guide page and `USER_GUIDE.md`, DECISIONS, CHANGELOG, NEXT-SESSION.

---

## Plan A+ — online rendering (needed before the online version, not before)

Two installation settings, both **unset by default**, in `.env.example` with comments (the
`envTemplateParity` unit test requires the template to list them):

- `ARES_SITE_URL` — what `http://ares.local` means here (e.g. `https://demo.aresedu.dev`).
- `ARES_KOLIBRI_URL` — what `http://ares.local:8069` means here (e.g.
  `https://demo.aresedu.dev/kolibri`).

When either is set, **immediately before generation** (the same place `withParenthesizedProseLinks`
runs in `generator/index.ts`), rewrite on a copy of the data:

- every `resourceLinks` URL field (`direct_url`, `search_url`, `exact_search_url`,
  `fallback_search_url`);
- every parenthesized `http://ares.local…` link in prose.

Longest prefix first (`http://ares.local:8069` before `http://ares.local`). Because the on-screen
lesson view and Quick preview are rendered from the generated DOCX, this covers Word, PDF and screen
in one place. The pristine vendored generator is not touched.

⚑ **Unset must be byte-identical to today.** The golden-file DOCX comparison and the hyperlink
fidelity gate (`lessonSequenceProseHyperlinkTargets` vs the actual DOCX relationships) must pass
unchanged with both settings unset; add a test with them set proving the relationships carry the
rewritten targets. The compare page and editor keep showing stored `ares.local` text — that is the
stored form, and it is correct.

---

## Plan B — later, not in this work

Search ARES from inside the dialog: the teacher types "photosynthesis", sees titled Kolibri results,
and clicks one to insert its `http://ares.local:8069/en/learn/#/topics/c/<id>` link. Feasible:
Kolibri's search answers without signing in (`/kolibri/api/content/contentnode_search/?search=…`
on the demo returns titles, kinds and ids). Sensible once Lesson3 runs on the ARES machine; it
depends on an interface Kolibri does not formally guarantee across versions, and searching
`/modules/` or `search.php` would mean scraping HTML. Start with Kolibri only, if at all.
