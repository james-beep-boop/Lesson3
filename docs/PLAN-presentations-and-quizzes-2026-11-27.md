# Presentations and quizzes in Lesson3: review and plan

Status: **draft for the operator's approval** (2026-11-27). Nothing here is built yet. It replaces the
2026-11-26 presentations plan (claude.ai artifact P4UzsA7EvWZg3gZJcSayfk), which had 19 questions for Mark.

## 1. Decisions already made (operator, 2026-11-26/27)

- **Editable decks are the goal.** Store each lesson's deck as structured data (Mark's *deck spec*) and
  regenerate the .pptx in-process with Mark's Node builder. This follows Lesson3's own rule: edit the data,
  never the document.
- **Build now against Mark's current, unstable deck format**, then swap in his final builder when it is
  stable. His builder is Node (PptxGenJS), so it fits the single runtime the same way the lesson-plan
  generator does.
- **Reuse working code.** Deck versions, drafts, permissions, the editing screen, the PDF path and the export
  cache follow the lesson-plan code paths. Generalise the existing code. Do not copy it.
- **Decks are versioned on their own**: one deck per lesson, with its own version numbers. A slide fix does
  not change the lesson plan, and a plan change does not change the deck.
- **Same people, same permissions.** The same three user types, with the same field rules as plans:
  teachers with editing access change text; subject-grade and site administrators change structure.
- **PDF previews of decks: yes**, through the existing Gotenberg sidecar (LibreOffice converts .pptx).
- **Quizzes and student accounts live in Kolibri.** Lesson3 stores quiz links only, as data inside a deck.
  It has no quiz engine and no student accounts.
- **No deploys for now.** `test.kenyalessons.org` stays on the version it runs today. When this work is
  ready, it goes to a **second subdomain on the Rock** for testing.
- **Tabled:** a "review" that finds a corrected science or maths error in a new deck and offers to carry
  the same fix back into the lesson plan, matched by fuzzy search.

## 2. What Mark has today (checked 2026-11-27)

Upstream is `markknit/cbe-generation-system` (public).

- **Decks** come from the `presentations` branch (`51033f4f`, 2026-11-24):
  - `generators/presentations/build_deck.js` and `lib/*.js` (PptxGenJS; drawn figures, theme, quiz links);
  - `config/deck_spec.schema.json`, in two authoring parts, A and B;
  - one spec per lesson at `data/presentations_specs/<Subject>/<SS>/L<n>.spec.json`, about 50 KB each.
    Only the Biology 1.1 pilot (12 lessons) is committed. The top-level keys are `hero`, `slides[]`
    (phase, title, blocks, timers, notes), `goals`, `key_words`, `safety`, `glance`, `summary`, the
    unit-map and notes fields, and a `build_log`;
  - pictures are referenced by `art_id` and made by a local image model. Finished decks are not in git.
  - **Mark's PAUSE:** the full 728-lesson Grade 10 run waits until the lesson plans are final.
- **Quizzes:** the main 80 plans come with 415 per-lesson Quick Check sheets and 415 Answer Keys (DOCX/PDF),
  plus 48 `quiz.json` files. Decks link to quizzes at `ares.local/quiz/<id>/v1/question/qNN`. That format is
  provisional. Three different quiz formats exist upstream.
- **Five new documents** (Compact Teacher Guide, Student Materials, Materials Teacher Key, Assessment
  Materials, Student Summary Table) come from the Python script `scripts/curriculum/compiler.py`
  (python-docx). So far they exist only for the 43 Codex "expansion" bundles.
  - The Compact Teacher Guide and the Student Summary Table are re-layouts of data Lesson3 already stores.
  - The other three are built from a "materials bank" (worksheet cards, diagrams, worked answers) that is
    **not** in the contract Lesson3 imports.

## 3. Design

### 3.1 File store (needed by everything else)
- One Payload upload collection for read-only files. Files sit on a disk volume next to the database and
  are included in backups.
- Each file attaches to a sub-strand bundle, or to one lesson in it, and has a *kind* (for example Quick
  Check, Answer Key, Student Materials).
- Any signed-in user can download. Subject-grade and site administrators can upload and remove.
- The catalogue's "Supporting documents" list shows generated documents first, then stored files by kind.
- A bulk import matches Mark's file names (`<filePrefix>_<Kind>.docx/.pdf`, per-lesson `_L<n>_`) to bundles
  and lessons. It reports anything it cannot match and never guesses.

### 3.2 Two more generated documents
- Port the **Compact Teacher Guide** and **Student Summary Table** layouts from `compiler.py`
  (`write_guide`, `write_student_summary`) to Node, using the same `docx` helpers as the vendored
  generator.
- Both are generated from stored plan data, so edits show up in them. They get a render-version bump.
- Student Materials, Materials Teacher Key and Assessment Materials stay **stored files** until Mark puts
  the materials bank into the contract.

### 3.3 Decks
- **Builder:** vendor `build_deck.js`, `lib/*.js` and the schema at a pinned `presentations` commit, with
  PROVENANCE hashes and a re-sync script, like `scripts/vendor-generator.sh`. Add a deck render version.
- **Model:** a deck record per lesson, keyed by subject-grade, sub-strand id and lesson number, with
  immutable deck versions (first import `1.0.0`, default bump patch, one official). The spec is modelled
  as **native Payload nested fields, not a JSON blob**, with the same prose grammar as plans (`\n` for a
  paragraph, a leading `- ` for a bullet, no inline markup). `build_log` and authoring prompts are kept as
  system-only data.
- **Permissions:** slide text, notes text, goals and key words are prose that teachers with editing access
  may edit. Slide add, remove and reorder, `phase`, minutes, timers, art choices and quiz links are
  administrator-only. This reuses `applyEditorFieldSplit` and the existing access functions.
- **Pictures:** art files are stored in the file store (3.1) and looked up by `art_id` at build time.
- **Import:** an administrator uploads a deck spec, or a zip of specs plus art. The spec is validated
  against the vendored schema. Like plan import, `.js` is never executed. An unchanged spec reports
  "already here".
- **Output:** a .pptx download, and a PDF through Gotenberg, both cached by version and render version.
- **Editing:** the lesson-plan editing screen, drafts and version saving, generalised so that they take a
  deck as well as a plan.

### 3.4 Quizzes
- Quiz links stay inside the deck spec, as data that administrators edit.
- Quick Check and Answer Key files are stored files (3.1).
- Lesson3 never runs quizzes or stores student results. That is Kolibri's job.

## 4. Work order for agentd

Each step is one issue, with one feature, and must merge on its own. Steps 1–3 are independent of the deck
format.

1. **File store and the Supporting documents list**: upload, download, remove, and per-role HTTP tests.
   This is also the first agentd task on Lesson3, so it doubles as a check that the setup works.
2. **Bulk import of Mark's extra files** by file name, with an unmatched-file report.
3. **Compact Teacher Guide and Student Summary Table**, generated, with golden-file tests.
4. **Vendor the deck builder** and build the Biology 1.1 L1 pilot spec in a test (no UI). A golden check
   compares the slide count and text against Mark's sample.
5. **Deck records, versions and import** (spec plus art), with HTTP authorisation tests.
6. **Deck downloads**: .pptx and PDF on the lesson page.
7. **Deck editing**, generalising the plan editing screen and drafts. This may split into 7a (text) and
   7b (structure).
8. **Test site on a second Rock subdomain.** This is the operator's step: DNS, tunnel and `sudo`. It is
   written as exact commands, not an agentd task.

## 5. Questions for Mark (kept short)

1. Is the deck spec (`config/deck_spec.schema.json`) plus `build_deck.js` the interface Lesson3 should
   build against? Will it carry a version number, like `schemaVersion`? What does a build need besides the
   spec: art files by `art_id`, anything else?
2. Will the materials bank (cards, diagrams, answers) join the contract, so that Lesson3 can regenerate
   Student Materials and the keys? Or will you keep sending finished files?
3. Which quiz format is authoritative, and is the `ares.local/quiz/...` link final? We plan to leave
   quizzes and results to Kolibri.
4. Which General Science, Essential Maths and Core Maths set is authoritative, and when does the real Core
   Maths arrive?

## 6. Remaining questions for the operator

- Who uploads stored files: subject-grade and site administrators? (Suggested: yes.)
- Should a new deck spec from Mark arrive as a new major version, like a lesson-plan release? (Suggested:
  yes, same release rules.)
