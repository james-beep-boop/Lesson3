# ARES Lesson Library — User Guide

ARES Lesson Plans stores ARES lesson plans as structured lesson data. You browse, edit,
preview, and export that data in the app; the system generates the Word and PDF documents for you.

The main areas are **Lessons** (the library — the one list of every lesson plan), the **lesson page**
(read, favorite, download, email, and share one lesson), **Manage** (editing, housekeeping, and
people functions available to your role), and **Messages** (notes between repository users). Editing
roles also see version and comparison controls on the library and lesson pages.

This file mirrors the in-app guide at `/guide`; keep the two in step when either changes.

## Teachers

Teachers use the Lessons area to find lesson plans, read them on screen, and download the generated
documents. Each lesson plan opens at its Official version. Editors and administrators also see an
_N versions_ panel and Compare control; Teachers do not use Manage or see version/editing controls.

- **Your account:** create one from the sign-in page's _Sign up_ link, then follow the verification
  link we email you before signing in. _Forgot password?_ on the same page emails you a reset link.
- **Browse lesson plans:** the home page groups lessons by subject-grade, strand, and sub-strand in
  curriculum order.
- **Search and filter:** use the search box to find a subject, grade, strand, or sub-strand, and use
  the subject and grade buttons to narrow the list. Search and filters work together.
- **Favorites:** click the star on a library row — or the _☆ Favorite_ button on a lesson page — to
  keep that lesson in My favorites at the top of the home page. For Teachers, the favorite follows
  the lesson's current Official version when a newer one is promoted. For editing roles, a favorite
  pins the exact version starred and a non-Official pin is labelled `vX (pinned)`. Favorites are
  personal — only you see yours.
- **Read on screen:** open a sub-strand to view the Lesson Sequence, Final Explanation, and Summary
  Table when those documents are present.
- **Open or download a document:** on the home page, each lesson row has a _PDF_ button (opens in a
  new tab) and a _Word_ button (downloads its `.docx`) for the lesson plan, with any Final
  Explanation or Summary Table behind a _Supporting documents_ line. On a lesson page, all downloads
  live in the _Share_ menu: each document on its own under _Download one document_, plus
  _Download all_ as a Word or PDF `.zip`.
- **Email:** choose _Share → Email to an address…_ on a lesson page to send the generated documents
  (as a .zip of Word files) to any email address — your own, or a colleague's. Sends are limited per
  day.
- **Want to edit?** use _Request editing access_ on a lesson page. The app messages the appropriate
  administrators for that subject-grade; requests are limited to once per subject-grade per day.
- **Messages:** open _Messages_ from the menu under your avatar (top right) to send a note to any
  user of the repository — a lesson page's _Share → Message a colleague_ item attaches that lesson
  to your note. Each message you receive has a _Reply_ button that opens a box to write straight back. Unread
  messages show as a small count on your avatar, and you get a short email telling you a message is
  waiting (never its content). Opening Messages marks everything shown as read.

## Editors

Editors can do everything Teachers can do, and their role is to edit the prose fields for the
subject-grades assigned to them — lesson titles, SLO text, overviews, learner experiences, teacher
moves, sensemaking strategies, formative assessments, teacher reflections, summary-table text, and
Final Explanation prompts. They never edit a Word file directly.

- **Edit from the lesson:** open a lesson in the library and press *Edit*. The editing page opens
  ready to type, showing only the fields you may change. *Preview* gives a quick check of your
  content and structure, while *View as PDF* shows the fully formatted document — both work on your
  unsaved edits, before you save. *← Back to lesson* returns you when you are done.
- **Saving makes a new version:** *Save* stores your edits as a new version of the lesson plan — the
  version you opened is never changed in place. A Subject or Site Administrator marks a saved version
  Official when it is ready.
- **Your drafts live in Manage:** *Manage → My saved versions* lists the versions you have saved —
  click one to continue editing, or delete the ones you no longer need.

## Subject Administrators

Subject Administrators can do everything Editors can do for their assigned subject-grades. They also
manage the structure and official content controls for those subject-grades.

- **Manage structure:** add, remove, and reorder lessons and instructional phases. To add a lesson,
  duplicate an existing lesson row, then edit the copy; this safely carries forward the hidden,
  system-managed ARES resource links. A blank new lesson cannot be saved without those links.
- **Edit controlled fields:** update metadata, sub-strand settings, lesson duration, ARES keywords,
  phase choices, assessment exemplars, and rubric rows.
- **Make Official:** on a lesson page, promote a saved version to the Official one Teachers see —
  optionally deleting the version it replaces.
- **Tidy candidates:** *Manage → Candidate versions* lists every saved, non-Official version in their
  subject-grades, with delete.
- **Appoint Editors:** *Manage → Editors* promotes a Teacher to Editor (or removes one) per
  subject-grade.

## Site Administrators

Site Administrators have full access across the repository. They manage users, curriculum taxonomy,
lesson-plan upload/import, and all lesson plans.

- **Everything lives on Manage:** upload lesson plans (each upload creates a lesson plan and its first
  Official version), repair plans that have no Official version, delete lesson plans (with all their
  versions), and reach the People and Curriculum lists.
- **Manage people:** create users, grant Site Administrator access, and assign Editor or Subject
  Administrator roles by subject-grade.
- **Manage curriculum:** maintain Subjects and Subject Grades before lesson plans are uploaded.
- **Review everything:** inspect, edit, export, mark Official, or delete lesson plans across all
  subjects and grades.

## Writing in Fields

Lesson content fields are plain text. Formatting is applied by the generator when you preview or
export.

- Start a new line to make a new paragraph.
- Start a line with `- ` to make a bullet.
- Do not add Markdown or rich-text markup; it will appear as typed.
- Edit the field that matches the document section you want to change. The exported DOCX and PDF are
  generated from those fields.

## Role Notes

- A **subject-grade** is the unit roles attach to, for example Biology Grade 10. Biology Grade 10 and
  Biology Grade 11 are separate scopes.
- Every lesson plan has one **Official** version at a time; Teachers see the Official version by
  default and can still open any other retained version from the selector.
- Editors and Subject Administrators act only within the subject-grades assigned to them; Site
  Administrators can see and manage everything.
- Email addresses are visible only to the account owner and Site Administrators.

---

Lesson Plans by [ARES Education](https://areseducation.org) — [Donate](https://areseducation.org/donate.html)
