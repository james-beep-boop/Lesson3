# ARES Lesson Library — User Guide

The Lesson Plan Repository stores ARES lesson plans as structured lesson data. Users browse, edit,
preview, and export that data in the app; the system generates the Word and PDF documents.

This file mirrors the in-app guide at `/guide`.

## Teachers

Teachers use the Lesson Plans area to find published lesson plans, read them on screen, and download
the generated documents. Teachers do not use the admin area and do not see editing controls.

- **Browse lesson plans:** the home page groups lessons by subject-grade, strand, and sub-strand in
  curriculum order.
- **Search:** use the search box to find a subject, grade, strand, or sub-strand.
- **Read on screen:** open a sub-strand to view the Lesson Sequence, Final Explanation, and Summary
  Table when those documents are present.
- **Download:** choose DOCX or PDF. Each download contains the generated lesson documents for that
  sub-strand.
- **Include ARES Resources:** turn the checkbox on for the layout that includes links to ARES
  resources.

## Editors

Editors can do everything Teachers can do. They also use **Manage** to edit prose fields for the
subject-grades assigned to them. Their edits create draft changes and version history inside the
repository; they never edit a Word file directly.

- **Open Manage:** use the header link to enter the admin area, then open Lesson Bundles.
- **Edit lesson prose:** update lesson titles, SLO text, overviews, learner experiences, teacher
  moves, sensemaking strategies, formative assessments, teacher reflections, summary-table prompts,
  summary-table lesson text, Final Explanation instructions, and Final Explanation section prompts.
- **Preview drafts:** use Preview before publishing to see the generated content from the current
  working copy, including unsaved field edits.
- **Save versions:** every save is tracked as a version of the whole sub-strand bundle.

## Subject Administrators

Subject Administrators can do everything Editors can do for their assigned subject-grades. They also
manage the structure and official content controls for those subject-grades.

- **Manage structure:** add, remove, and reorder lessons and instructional phases.
- **Edit controlled fields:** update metadata, sub-strand settings, lesson duration, ARES keywords,
  phase choices, assessment exemplars, and rubric rows.
- **Control official versions:** mark the approved version that Teachers should use.
- **Manage scoped roles:** assign Editors for the subject-grades they administer.

## Site Administrators

Site Administrators have full access across the repository. They manage users, curriculum taxonomy,
ingestion, and all lesson bundles.

- **Manage people:** create users, grant Site Administrator access, and assign Editor or Subject
  Administrator roles by subject-grade.
- **Manage curriculum:** maintain Subjects and Subject Grades before lesson bundles are ingested.
- **Ingest lesson plans:** upload ARES JSON lesson bundles through the admin upload action.
- **Review everything:** inspect, edit, publish, export, or delete lesson bundles across all subjects
  and grades.

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
- Teachers can read and export published lesson plans.
- Editors and Subject Administrators can see drafts for the subject-grades assigned to them.
- Site Administrators can see and manage everything.
- Email addresses are visible only to the account owner and Site Administrators.
