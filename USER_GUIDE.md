# ARES Lesson Library — User Guide

This guide describes the **target product** (see `SPEC.md`). The library lets authorized users browse ARES CBE lesson plans, make basic edits, keep a full version history, and export polished Word and PDF documents.

> Status: the application is built and running in a verification environment. Browsing, role-based
> editing, version history, on-screen preview, and Word **and PDF** export all work today. It is not
> yet hardened for production at scale. Exact screens and demo accounts are still being finalized.

## What users can do

- Sign in and browse lesson plans by subject and grade.
- Open a sub-strand to read its lessons, assessment, and summary.
- **Edit lesson text** where your role allows — you edit individual fields (e.g. a lesson's *Teacher Moves* or *Overview*); you never edit a Word file directly.
- See a full **version history**; every save is a new, permanent version you can compare and return to.
- **Preview and export** any version as a high-fidelity **Word (.docx)** or **PDF** document — formatting matches ARES's approved layout.
- Print or email exported documents.

## How editing works

Lesson plans are **structured content**, not free-form documents. When you edit, you change the text of specific fields in a form shaped like the lesson. Formatting, tables, and styling are produced automatically on export — you only write the words. New lines start new paragraphs; begin a line with `- ` to make a bullet.

Some fields are restricted: lesson structure, sub-strand settings, assessment answer keys, and resource keywords are managed by Subject Administrators, not by Editors.

## Roles

### Teacher (default)
- View and export lesson plans. No editing.

### Editor (per subject-grade)
- Everything a Teacher can do.
- Edit the text fields of lessons in their assigned subject-grades and save new versions.

### Subject Administrator (per subject-grade)
- Everything an Editor can do.
- Add/remove/reorder lessons, edit sub-strand settings and assessment answer keys, mark a version official, and manage Editors for their subject-grades.

### Site Administrator
- Full access: manage users, roles, subjects and subject-grades, and review everything across the library.

## Notes

- A **subject-grade** (e.g. "Biology — Grade 10") is the unit roles attach to; "Grade 10" and "Grade 11" are managed independently.
- Email addresses are visible only to Site Administrators.
- The interface changes by role, so different users see different actions.
