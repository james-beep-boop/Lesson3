import React from 'react'
import Link from 'next/link'

import { requireUser } from '@/lib/session'

export default async function UserGuidePage() {
  await requireUser()

  return (
    <article className="guide">
      <header className="guide-intro">
        <p className="guide-kicker">User guide</p>
        <h1>Lesson Plan Repository</h1>
        <p>
          The repository stores ARES lesson plans as structured lesson data. You browse, edit, preview,
          and export that data in the app; the system generates the Word and PDF documents for you.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Guide sections">
        <a href="#teachers">Teachers</a>
        <a href="#editors">Editors</a>
        <a href="#subject-admins">Subject Administrators</a>
        <a href="#site-admins">Site Administrators</a>
        <a href="#writing">Writing in fields</a>
      </nav>

      <section id="teachers" className="guide-section">
        <h2>Teachers</h2>
        <p>
          Teachers use the Lesson Plans area to find lesson plans, read them on screen, and download
          the generated documents. Each lesson plan opens at its Official version, with a selector for
          any other retained version. Teachers do not use the admin area and do not see editing controls.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Browse lesson plans:</strong> the home page groups lessons by subject-grade, strand,
            and sub-strand in curriculum order.
          </li>
          <li>
            <strong>Search:</strong> use the search box to find a subject, grade, strand, or sub-strand.
          </li>
          <li>
            <strong>Read on screen:</strong> open a sub-strand to view the Lesson Sequence, Final
            Explanation, and Summary Table when those documents are present.
          </li>
          <li>
            <strong>Download:</strong> choose DOCX or PDF. Each download contains the generated lesson
            documents for that sub-strand.
          </li>
          <li>
            <strong>Include ARES Resources:</strong> turn the checkbox on for the layout that includes
            links to ARES resources.
          </li>
        </ul>
      </section>

      <section id="editors" className="guide-section">
        <h2>Editors</h2>
        <p>
          Editors can do everything Teachers can do, and their role is to edit the prose fields for the
          subject-grades assigned to them — lesson titles, SLO text, overviews, learner experiences,
          teacher moves, sensemaking strategies, formative assessments, teacher reflections,
          summary-table text, and Final Explanation prompts. They never edit a Word file directly.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Working versions, not Official ones:</strong> editing always works on a new
            <em> working</em> version. The Official version is never changed in place; a Subject or
            Site Administrator marks a working version Official when it is ready.
          </li>
          <li>
            <strong>Rolling out:</strong> direct self-service editing for Editors is being enabled. For
            now, prose edits are made by a Subject Administrator for the editor’s subject-grades.
          </li>
        </ul>
      </section>

      <section id="subject-admins" className="guide-section">
        <h2>Subject Administrators</h2>
        <p>
          Subject Administrators can do everything Editors can do for their assigned subject-grades.
          They also manage the structure and official content controls for those subject-grades.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Manage structure:</strong> add, remove, and reorder lessons and instructional phases.
          </li>
          <li>
            <strong>Edit controlled fields:</strong> update metadata, sub-strand settings, lesson
            duration, ARES keywords, phase choices, assessment exemplars, and rubric rows.
          </li>
          <li>
            <strong>Control official versions:</strong> mark the approved version that Teachers should
            use.
          </li>
          <li>
            <strong>Manage scoped roles:</strong> assign Editors for the subject-grades they administer.
          </li>
        </ul>
      </section>

      <section id="site-admins" className="guide-section">
        <h2>Site Administrators</h2>
        <p>
          Site Administrators have full access across the repository. They manage users, curriculum
          taxonomy, lesson-plan upload/import, and all lesson plans.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Manage people:</strong> create users, grant Site Administrator access, and assign
            Editor or Subject Administrator roles by subject-grade.
          </li>
          <li>
            <strong>Manage curriculum:</strong> maintain Subjects and Subject Grades before lesson
            plans are uploaded.
          </li>
          <li>
            <strong>Upload lesson plans:</strong> import ARES lesson data through the admin upload
            action; each upload creates a lesson plan and its first Official version.
          </li>
          <li>
            <strong>Review everything:</strong> inspect, edit, export, mark Official, or delete lesson
            plans across all subjects and grades.
          </li>
        </ul>
      </section>

      <section id="writing" className="guide-section">
        <h2>Writing in Fields</h2>
        <p>
          Lesson content fields are plain text. Formatting is applied by the generator when you preview
          or export.
        </p>
        <ul className="guide-list">
          <li>Start a new line to make a new paragraph.</li>
          <li>
            Start a line with <code>- </code> to make a bullet.
          </li>
          <li>Do not add Markdown or rich-text markup; it will appear as typed.</li>
          <li>
            Edit the field that matches the document section you want to change. The exported DOCX and
            PDF are generated from those fields.
          </li>
        </ul>
      </section>

      <footer className="guide-footer">
        <Link href="/">Back to lesson plans</Link>
      </footer>
    </article>
  )
}
