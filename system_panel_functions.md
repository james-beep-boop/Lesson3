# The System panel, and everything else decided in the last 36 hours

A plain-English summary of work done on 20–21 August 2026. Written for someone coming back to this
project after a break, or reading it for the first time.

## Read this bit first: built, decided, or still open?

A lot of this was **design work**, not code. Mixing the two up is how a plan gets mistaken for a
feature, so every item below is tagged:

- **BUILT** — it is in the app now, merged, with tests.
- **DECIDED** — the argument is settled and written down, but nothing has been coded.
- **OPEN** — genuinely undecided.
- **DEFERRED** — decided *not* to do it yet, on purpose.

⚑ And one thing that applies to everything marked BUILT: it is on the `main` branch but **not yet
running on the school server**. Two database changes are waiting. See "Not deployed yet" at the end.

---

## 1. The new System panel — the information half is BUILT, the switches are not

Manage has a new box called **System**, alongside the existing Users, Curriculum, Lesson plans and the
saved-versions box. Only a Site Administrator can see it at all. It answers the question an
administrator actually asks when something looks wrong: *what is this installation, and is it working?*

It is designed in two halves, which differ in kind. **The first is built and merged; the second is
designed and not started.**

### The top half: things you can look at but not change

Seven rows, each showing a green/grey/amber state:

| Row | What it tells you |
|---|---|
| Base URL | the web address this installation thinks it has |
| Public library capability | whether this installation is *allowed* to publish lessons publicly |
| Outbound email | whether email is set up at all |
| Error tracking | whether crash reporting is switched on |
| Last successful backup | when a backup last actually finished, and where it went |
| PDF engine | whether the thing that makes PDFs is answering right now |
| Artifact cache | how much disk the cache of generated documents is using |

Each row names the setting that controls it, so an administrator knows *where* to go and change it —
rather than seeing "Outbound email: off" and having no idea why.

Three deliberate choices here worth knowing:

- **No switches in this half.** Not even greyed-out ones. These are things fixed when the server
  starts, so a switch would appear to work and then silently do nothing until a restart. A switch that
  lies is worse than no switch.
- **Nothing here can break the page.** If the PDF engine is unreachable, that row says "not reachable"
  and the other six still show. A single broken thing must never take down the page you opened
  *because* something was broken.
- **Everything has a time limit.** Each check gives up after one second, including the backup check —
  which reads a file the server writes. A stuck disk can no longer hang the page.

### The bottom half: switches — DECIDED, NOT BUILT

This is worth being precise about, because it is easy to assume the switches exist. **Only the
look-but-don't-touch half above has been built.** The panel currently has no switches at all.

What the design settles for when they are built:

- **Exactly one real switch**: whether the public lesson library is live. It was going to be two, but
  the second — a general "turn off email" switch — was **decided against and its half-built storage
  removed**, because one switch covering both password-reset emails and optional notifications could
  leave people locked out of their accounts with no way back in. Password and verification emails will
  never be switchable from this screen. Any future email control has to be specific about which kind of
  email it turns off.
- **Two rows shown but disabled, carrying the true reason** — student access and student quizzes — since
  they are not built anywhere. Saying so plainly beats "coming soon".
- **Saving a switch will be deliberately awkward**: it re-checks the administrator's password, refuses
  if someone else changed the settings since the page loaded, requires ticking an acknowledgement of the
  consequences, and records who changed what and when.

### What this panel deliberately is not

It does not install anything, start anything, build anything, or download anything. It observes and it
switches. Anything that needs a restart or a download stays a job for whoever runs the server.

---

## 2. Backups — BUILT, and the biggest change

The word "backup" had started covering four unrelated protections. Separating them was half the work:

| Protection | What it saves you from | Status |
|---|---|---|
| Saved lesson-plan versions | a bad edit, or publishing the wrong version | already existed |
| Edit recovery | losing unsaved typing to a logout or a crashed tab | already existed |
| The cache of generated documents | regenerating a Word file needlessly | **not a backup** — it is meant to be thrown away |
| Encrypted database backup | the server or its disk dying | already existed, extended here |

The database backup already covered everything that matters, because every lesson plan, saved version,
user, assignment, message and recovered edit lives in the one database. So this work **extended** the
existing backup rather than inventing a second one. Three additions:

**A USB stick is now a proper destination.** Schools with no internet could not send backups to Google
Drive. They can now write to a removable drive instead, through exactly the same encrypt-and-copy steps.
The tricky part was making a *missing* drive fail loudly: if you write to the folder where a USB drive
*should* be mounted and it is not there, the files quietly land on the server's own disk instead — so
backups appear to work, go nowhere, and slowly fill the boot disk. The script now requires a marker file
that lives on the drive itself, checks the drive is a genuinely separate device, and re-checks that the
same drive is still there after the copy. Any of those failing stops the backup instead of faking it.

**Successful backups now leave a record**, which is what the "Last successful backup" row reads. It is
written by the backup script itself, only after the copy has actually succeeded, and the app can only
read it — never write it. That is deliberate: it means the row is evidence, not the app's opinion of
itself. A failed backup cannot advance the record, and a missing record shows "Unknown" rather than
claiming no backup exists.

**⚑ Two things a green row does not prove**, both now written into the operations notes:

1. **It does not prove backups are running on a schedule.** Every deployment takes a snapshot before it
   changes the database, so a server with no scheduled backup at all will still show a recent success —
   labelled *Premigration*. A healthy installation shows *Daily*. That is why the row names which kind
   it was.
2. **It does not prove the backup can be restored.** The record says a file was uploaded, not that it
   decrypts or that the database will accept it. Only actually doing a test restore proves that, and
   nothing on the screen can substitute for having done one.

---

## 3. Schools with internet, and schools without — DECIDED

Three quite different situations, and the app has to be one piece of software that suits all three:

| | ARES schools | SeaVuria schools | Online |
|---|---|---|---|
| Internet | none at all | limited | fast |
| Students | 100–1000 enrolled, at most ~50 using it at once | same | open to anyone |
| Student phones | mostly none — teachers only, though changing in towns | same | yes |
| Power | unreliable | unreliable | reliable |

The decided approach is **not** a "mode" setting with three options. Modes accumulate exceptions until
they mean nothing — "limited internet" is not a third mode, it is *mostly offline with some specific
things allowed out*, and which things is a separate question each time. Instead, capabilities are
individual, and every capability question is one of five different things:

1. **Is it installed at all?** (decided by how the server was built)
2. **Is this installation even allowed to do it?** (decided by server settings and a restart)
3. **Does the administrator want it on right now?** (the switches in the System panel)
4. **Is it working at this moment?** (the checks in the top half)
5. **Does the code actually stop it?** (server code — never the panel)

Layers 2 and 3 stack: something the installation is not allowed to do gets no switch at all, and the
row instead explains that the environment forbids it. Confusing any two of these five is how a label
ends up claiming something the code does not do — which is why they are written down.

**DEFERRED:** the idea of "school type" presets that fill in the individual switches for you. Still
thought to be the right shape eventually, but not built, and a preset must never be a security
boundary — choosing "online school" on a box with no public address must not switch publishing on.

### Related, and also decided: teachers' data costs are a real design constraint

Teachers pay for mobile data a few megabytes at a time; unlimited plans are uncommon. So a 15 MB
download is not a rounding error to a teacher even though it is nothing to the project. This is why the
server images ship **without** the Microsoft fonts and fetch them only if someone chooses to — measured
sizes are 2.46 GB, 1.81 GB and 338 MB for the three server pieces, of which the fonts are only ~10–15
MB. Bandwidth, not licensing, turned out to be the binding constraint on a fresh install.

---

## 4. Quizzes — DECIDED, none of it built

The goal is students practising **on their own, at home, without a teacher present**. That single
sentence settled five things, each cheap now and expensive to retrofit:

1. **Phones come first.** Elsewhere this project says explicitly that phones are not for editing. The
   quiz is the opposite: a student at home is on a phone, and a small screen is the primary target
   rather than a courtesy.
2. **Every question needs a written explanation**, not just a right answer. With no teacher there, the
   explanation *is* the teaching. Adding this later means rewriting every question.
3. **Every question is tagged with the concept it tests**, from the very first one. That is what would
   later allow "give me more questions on what I got wrong". It is nearly free now and impossible to
   backfill.
4. **Never graded.** Practice only. The moment a score counts for anything, the correct answers being
   visible in the page becomes an exam-security problem — a whole discipline this project does not want.
5. **The written specification has to change**, because per-student progress tracking is a
   learning-management feature the project had explicitly ruled out. That is the operator's call to
   make, but it lands as a deliberate amendment rather than being discovered later as drift.

**Also decided:** quizzes live inside this app rather than as a separate installable thing, and roughly
50 students at once is not a strain — quiz traffic is small amounts of text, unlike document generation.

**OPEN:** where the questions come from. Three candidates — supplied with the ARES lesson data,
AI-generated then reviewed by a Subject Administrator, or typed in by hand. Because it is undecided, the
data has to be built to accept all three and record which one it was, so the choice can be made later
without a rebuild. For scale: about 10 questions per lesson, so one subject-and-grade runs to ~480.

---

## 5. Students, and the law — DECIDED (with an important correction)

Two levels of student access were agreed:

- **Level 1: anonymous practice.** No account, no login, nothing kept between sittings. This is also
  the way strangers would find the product.
- **Level 2: school-managed accounts, on the school's own server only.** The school enrols its
  students and obtains parental consent; that data never goes to the internet.

⚑ **A claim was corrected here, and the correction matters.** An earlier draft said the anonymous level
meant Kenyan data-protection law "does not engage", that there was "no compliance surface at all".
That was too strong and has been removed. Kenyan law counts online identifiers — addresses, session
identifiers, even the counters used to block abuse — toward identifying a person, so having no accounts
is not automatically the same as being anonymous. Also, Kenya treats everyone under 18 as a child with
no lower age step-down, so parental consent and age-verification rules apply to every school student,
not just younger ones.

What the documents now claim is narrower and honest: the anonymous level is *designed* to avoid keeping
per-person data, and whether it is anonymous in law depends on the logging, monitoring and abuse-control
details — which need review before anything goes public. There is a real tension recorded there too:
the very counters needed to stop abuse are the thing most likely to create per-person identifiers.

Also flagged as the sharpest hazard in the whole plan: adding students as a new kind of account would
**not** by itself keep them out of teacher and administrator functions, because a student would still
count as a logged-in user everywhere the code just asks "is someone logged in?". That has to be built
deliberately, not assumed.

---

## 6. Permissions — BUILT

**A Subject Administrator can now hand their role over, but cannot take it away.** Previously the
controls were symmetric. Now: they may pass administration to a teacher who already has editing access
for that subject and grade — which immediately demotes themselves, since there is only ever one — and
they may **not** remove any administrator, including themselves. Only a Site Administrator can empty
the seat. The reasoning is that handing over is a decision about your own role, whereas removing
somebody is a decision about theirs.

Because a handover is irreversible for the person doing it, each grant now records **who granted it and
when**, so an irreversible action has an answer in the data afterwards. A blank means "we do not know",
never "nobody".

**Also cleaned up: the word "Editor" is no longer used as a type of user.** There are three kinds of
account — Teacher, Subject-grade administrator, Site administrator — and that is the whole list. A
teacher who can edit is a *Teacher with editing access*; being able to edit is a permission for
particular subjects and grades, not a different kind of account. All the current documents were
corrected. The dated records — the decision log, the changelog, superseded handover notes — were
deliberately **left alone**, because they describe what the label was at the time, and rewriting them
would make the original renaming decision unreadable.

---

## 7. Copyright and licensing — MOSTLY DEFERRED, one decision made

The eventual goal is a package someone can download from the public repository and install on a local
school server. That raises four separate questions, and they do not all want the same answer:

1. **This project's own code — DECIDED: MIT.** Chosen to match the licence of the main framework the
   project is built on, so there is no friction. (An alternative with an explicit patent grant was
   considered and not taken.)
2. **⚑ There is still no licence file in the repository, and the repository is public.** Strictly, that
   means nobody may use, modify or run it, and there are no terms for anyone contributing. This is the
   cheapest high-value item outstanding: one file.
3. **The borrowed document generator** — three files copied verbatim from another ARES project.
   Publishing them here redistributes them, so permission is needed, compatible with the MIT choice
   above.
4. **The lesson content itself** — a Creative Commons attribution licence is the candidate, but it has
   to be asked for. Note this is *two* requests in one conversation, not one: content and software want
   different licences, and Creative Commons is the wrong family for code.

**DEFERRED but expected to be needed:** printing attribution *inside* the documents. If the content
arrives under an attribution licence, attribution is the condition of using it — and these Word and PDF
files travel by email and USB with no app around them, so nothing carries the credit unless the document
itself does. That is a change to the document generator, not to any screen.

One factual correction worth recording: the PDF engine's licence was checked and is MIT. An earlier
draft had stated a different licence from memory, and was wrong.

---

## 8. A security fix worth understanding — BUILT

The System panel's settings were meant to be saved only through a careful path that re-checks the
administrator's password and records who changed what. It turned out the ordinary web interface for
those settings was still open, so a Site Administrator could change them directly and skip all of that.

An intermediate fix hid the settings screen and was described as closing the hole. It did not — hiding
a screen does not close the door behind it, and only a test that actually tries the door can tell those
apart. The door is now shut for everyone, including Site Administrators, and the test that proves it
checks the *Site Administrator* case specifically: everybody else being refused only proves ordinary
permissions work.

A second, subtler problem was found in the fix itself. The record of who changed a setting was being
kept even for a change made by an automated process with no person attached — so it would name the
previous person as the author of a change they did not make. Now a change with no known author clears
the record rather than keeping a stale one, because **a wrong audit record is worse than a missing
one**: it is consulted exactly when someone has stopped trusting the system.

---

## 9. Not deployed yet ⚑

Everything marked BUILT is merged, but **the school server is still running an older version**. There
are two pending database changes (one adding the settings storage, one removing a setting that was
decided against before anything used it). They should go together, and the deployment script handles the
whole procedure — including taking an encrypted snapshot first and refusing to proceed if backups are
not configured.

To check the current gap:

```bash
git log --oneline 30d3c45..main
```

Once deployed, the deployment's own pre-change snapshot will immediately fill in the "Last successful
backup" row — labelled *Premigration*, which as above is not the same as a working schedule.

---

## Where the detail lives

- `SPEC.md` — the rules of the product, including the backup requirements (§11).
- `docs/DESIGN-next-direction-2026-08-19.md` — the single authority on deployment, offline schools,
  quizzes, students and the legal position.
- `docs/DESIGN-system-panel-2026-08-21.md` — the System panel in detail, including what has been built
  versus what the design still asks for.
- `docs/DECISIONS.md` — the dated log of decisions and corrections, newest first.
- `docs/OPS.md` — how to actually set up backups, on Drive or USB, and how to run a test restore.
- `docs/NEXT-SESSION.md` — what to pick up next.
