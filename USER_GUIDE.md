# ARES Lesson Library — User Guide

The Lesson Plan Repository stores ARES lesson plans as structured lesson data. You browse, edit,
preview, and export that data in the app; the system generates the Word and PDF documents for you.

There are three places: **Lessons** (the library — the one list of every lesson plan), the **lesson
page** (everything about one lesson: read, versions, download, and — for editing roles — Edit and
Make Official), and **Manage** (housekeeping and people, showing only the functions your role has).

This file mirrors the in-app guide at `/guide`; keep the two in step when either changes.

## Teachers

Teachers use the Lessons area to find lesson plans, read them on screen, and download the generated
documents. Each lesson plan opens at its Official version, with a selector for any other retained
version. Teachers do not use the admin area and do not see editing controls.

- **Browse lesson plans:** the home page groups lessons by subject-grade, strand, and sub-strand in
  curriculum order.
- **Search:** use the search box to find a subject, grade, strand, or sub-strand.
- **Favorites:** click the star on a lesson to pin it to a My favorites list at the top of the home
  page. Favorites are personal — only you see yours.
- **Read on screen:** open a sub-strand to view the Lesson Sequence, Final Explanation, and Summary
  Table when those documents are present.
- **Download:** choose DOCX or PDF. Each download contains the generated lesson documents for that
  sub-strand.
- **Email:** use the Email button to send the generated documents (as a .zip of Word files) to any
  email address — your own, or a colleague's. Sends are limited per day.
- **Messages:** use Messages in the top bar to send a note to any user of the repository — a lesson
  page's "Message a colleague" link attaches that lesson to your note. Unread messages show as a
  count on the Messages link, and you get a short email telling you a message is waiting (never its
  content). Opening Messages marks everything shown as read.

## Editors

Editors can do everything Teachers can do, and their role is to edit the prose fields for the
subject-grades assigned to them — lesson titles, SLO text, overviews, learner experiences, teacher
moves, sensemaking strategies, formative assessments, teacher reflections, summary-table text, and
Final Explanation prompts. They never edit a Word file directly.

- **Edit from the lesson:** open a lesson in the library and press *Edit*. The editing page opens
  ready to type, showing only the fields you may change; *← Back to lesson* returns you when you are
  done.
- **Saving makes a new version:** *Save* stores your edits as a new version of the lesson plan — the
  version you opened is never changed in place. A Subject or Site Administrator marks a saved version
  Official when it is ready.
- **Your drafts live in Manage:** *Manage → My saved versions* lists the versions you have saved —
  click one to continue editing, or delete the ones you no longer need.

## Subject Administrators

Subject Administrators can do everything Editors can do for their assigned subject-grades. They also
manage the structure and official content controls for those subject-grades.

- **Manage structure:** add, remove, and reorder lessons and instructional phases.
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
