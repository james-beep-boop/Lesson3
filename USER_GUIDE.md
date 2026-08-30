# ARES Lesson Library — User Guide

ARES Lesson Plans stores ARES lesson plans as structured lesson data. You browse, edit,
preview, and export that data in the app; the system generates the Word and PDF documents for you.

The main areas are **Lessons** (the library — the one list of every lesson plan), the **lesson page**
(read, favorite, download, email, and share one lesson), **Manage** (editing, housekeeping, and
people functions available to your role), and **Messages** (notes between repository users). Teachers
with editing access also see version and comparison controls on the library and lesson pages.

This file mirrors the in-app guide at `/guide`; keep the two in step when either changes.

## Teachers

Teachers use the Lessons area to find lesson plans, read them on screen, and download the generated
documents. Each lesson plan opens at its Official version. Teachers with editing access, and
administrators, also see an _N versions_ panel and Compare control; teachers without it do not use
Manage or see version/editing controls.

- **Your account:** create one from the sign-in page's _Sign up_ link, then follow the verification
  link we email you before signing in. _Forgot password?_ on the same page emails you a reset link.
  If your school's installation cannot send email — some run with no internet — ask a Site
  administrator instead: they can create a reset link and give it to you directly.
- **Browse lesson plans:** the home page groups lessons by subject-grade, strand, and sub-strand in
  curriculum order.
- **Search and filter:** use the search box to find a subject, grade, strand, or sub-strand, and use
  the subject and grade buttons to narrow the list. Search and filters work together.
- **Favorites:** click the star on a library row — or the _☆ Favorite_ button on a lesson page — to
  keep that lesson in My favorites at the top of the home page. For Teachers, the favorite follows
  the lesson's current Official version when a newer one is promoted. If you have editing access, a
  favorite pins the exact version starred and a non-Official pin is labelled `vX (pinned)`. Favorites are
  personal — only you see yours.
- **Read on screen:** open a sub-strand to view the Lesson Sequence, Final Explanation, and Summary
  Table when those documents are present.
- **Open or download a document:** on the home page, each lesson row has a _PDF_ button (opens in a
  new tab) and a _Word_ button (downloads its `.docx` — on a phone, Word is available by email
  instead) for the lesson plan, with any Final
  Explanation or Summary Table behind a _Supporting documents_ line. On a lesson page, all downloads
  live in the _Share_ menu: each document on its own under _Download one document_, plus
  _Download all_ as a Word or PDF `.zip`. On a phone the Word downloads are omitted — use
  _Email all — Word_, or a larger screen.
- **Email:** choose _Share → Email all — Word_ or _Email all — PDF_ on a lesson page to send the
  generated documents (as a .zip of that format) to any email address — your own, or a colleague's. Sends are limited per
  day.
- **Want to edit?** use _Request editing access_ on a lesson page. The app messages the appropriate
  administrators for that subject-grade; requests are limited to once per subject-grade per day.
- **Messages:** open _Messages_ from the menu under your avatar (top right) to send a note to any
  user of the repository — a lesson page's _Share → Message a colleague_ item attaches that lesson
  to your note. Each message you receive has a _Reply_ button that opens a box to write straight back. Unread
  messages show as a small count on your avatar, and you get a short email telling you a message is
  waiting (never its content). Opening Messages marks everything shown as read.

## Editing

A teacher with editing access can do everything any teacher can, plus edit the prose fields for the
subject-grades they have been granted — lesson titles, specific learning outcomes, overviews, learner
experiences, teacher moves, sensemaking strategies, formative assessments, teacher reflections,
summary-table text, and Final Explanation prompts. They never edit a Word file directly.

- **Edit from the lesson:** open a lesson in the library and press *Edit*. The editing page opens
  ready to type, showing only the fields you may change. *Quick preview ↗* checks your content,
  while *Formatted PDF ↗* shows the final layout. Both open in a new tab and include unsaved edits;
  close that tab to return to the editor. Use *Help* for the short writing rules. *Back* at the top
  right returns you when you are done.
- **Saving makes a new version:** *Save* stores your edits as a new version of the lesson plan — the
  version you opened is never changed in place. A Subject-grade or Site administrator marks a saved
  version Official when it is ready.
- **Your drafts live in Manage:** *Manage → Lesson plans → My saved versions* lists the versions you have saved —
  click one to continue editing, or delete the ones you no longer need.
- **Unsaved work is backed up for you:** while you edit, a notice under the buttons shows when your
  unsaved changes were last backed up. The backup is yours alone — nobody else can see it, not even
  someone signing in on the same computer — and it is never applied automatically.
- **Coming back to unsaved work:** if you leave the editor without saving, the next time you open
  that version you are offered those changes back. The panel lists only what differs from the saved
  version, and shows each change word by word: your unsaved wording in green, what the saved version
  says struck through in red. A change that cannot be shown that way is named instead — *Emptied*
  where the field would be cleared, *Paragraph breaks changed* where only the line breaks moved,
  *Spacing only* where nothing visible differs. Then choose to put the changes back, decide later,
  or discard them; discarding cannot be undone.
- **If someone else saved in the meantime:** your changes cannot be put back automatically, because
  the lesson plan moved underneath them. They are still shown in full so you can read them and copy
  across whatever you still want.
- **Compare two versions:** the *N versions* panel's *Compare* button puts two versions side by
  side, removals in red and additions in green. Comparison is area by area — each lesson's outcomes,
  overview, implementation framework, teacher reflection and summary prompts separately — so the page
  opens with a count of the changed areas, a list you can click to jump to any of them, and only the
  changed areas shown. Turn off *Changes only* to read both versions in full. An area marked
  *Spacing or document structure changed* differs only in how the text is broken up — the wording is
  the same, which is why nothing in it is coloured.

## Subject-grade administrators

A Subject-grade administrator can do everything a teacher with editing access can, for their assigned
subject-grades. They also manage the structure and official content controls for those subject-grades.

- **Manage structure:** add, remove, and reorder lessons and instructional phases. To add a lesson,
  duplicate an existing lesson row, then edit the copy.
- **Edit controlled fields:** update Document settings, the Sub-strand overview, lesson duration,
  ARES keywords, phase choices, assessment exemplars, and rubric rows.
- **Make Official:** on a lesson page, promote a saved version to the Official one Teachers see —
  optionally deleting the version it replaces.
- **Tidy candidates:** *Manage → Lesson plans → Candidate versions* lists every saved, non-Official version in their
  subject-grades, with delete.
- **Roles & Access:** *Manage → Users → Roles & Access* gives a teacher editing access, or removes it,
  per subject-grade. It also shows who administers each of your subject-grades, and the addresses of
  the people listed there — granting access is a permission decision, and two teachers can share a
  display name.
- **Hand administration over:** in the same panel you can make one of your subject-grade's existing
  editors its Subject-grade administrator. You are demoted to editing access in the same step, and
  only a Site administrator can give it back — so the panel asks you to confirm before it happens.
  Whoever you hand it to must already have editing access there, which keeps the choice to people
  already trusted with that subject-grade's content.

## Site administrators

Site administrators have full access across the repository. They manage users, curriculum taxonomy,
lesson-plan upload/import, and all lesson plans.

- **Everything lives on Manage:** upload lesson plans (each upload creates a lesson plan and its first
  Official version), repair plans that have no Official version, delete lesson plans (with all their
  versions), and reach the People and Curriculum lists.
- **Manage people:** create users, grant Site administrator access, and grant editing access or
  Subject-grade administrator access by subject-grade. Site administrators are also the only ones who
  can **remove** a Subject-grade administrator: an administrator may hand the role on, but nobody can
  take it away from them, and nobody can resign it.
- **Reset a password by hand:** where email is not set up, you can create a one-time reset link for an
  account and hand it over. You never see or choose the password — the person sets their own through the
  normal reset page.
- **See what this installation is:** Manage → System reports the address, whether email and public
  sharing are available, whether PDF output is working, and when a backup last succeeded. Everything
  there is read-only: those are decided on the server, so changing one is a server job, not a click.
- **Manage curriculum:** maintain Subjects and Subject Grades before lesson plans are uploaded.
- **Review everything:** inspect, edit, export, mark Official, or delete lesson plans across all
  subjects and grades.

## Writing in Fields

These rules are also available from *Help* at the top of the editor.

- Start a new line to make a new paragraph.
- Start a line with `- ` to make a bullet.
- Use *Insert link* beneath a prose field to insert an internet address or choose a PDF already on
  the Rock. The address appears in parentheses and becomes clickable in the on-screen view and
  generated Word/PDF documents. Web and PDF links open separately so your editor stays open.
- Bold, italics, and underlining are not supported.
- Edit the field that matches the document section you want to change. The exported DOCX and PDF are
  generated from those fields.

## Role Notes

- A **subject-grade** is the unit roles attach to, for example Biology Grade 10. Biology Grade 10 and
  Biology Grade 11 are separate scopes.
- Every lesson plan has one **Official** version at a time. Teachers open the Official version and do
  not get the version selector — but versions are not access-gated, so a direct link to a specific
  version still opens for any signed-in user. Official is the default and the trust marker, not a
  permission boundary.
- Teachers with editing access and Subject-grade administrators act only within the subject-grades
  assigned to them; Site administrators can see and manage everything.
- Email addresses are visible to the account owner and to Site administrators, with **one exception:**
  in *Manage → Users → Roles & Access* a Subject-grade administrator also sees the addresses of the
  people listed for their own subject-grades. No other screen shows them.

---

Lesson Plans by [ARES Education](https://areseducation.org) and [Seavuria](https://www.seavuria.org)

[Donate to ARES Education](https://areseducation.org/donate.html) · [Donate to Seavuria](https://www.seavuria.org/donate)
