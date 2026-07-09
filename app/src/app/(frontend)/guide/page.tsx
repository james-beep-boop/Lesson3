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
        <p>
          There are three places: <strong>Lessons</strong> (the library — the one list of every lesson
          plan), the <strong>lesson page</strong> (everything about one lesson: read, versions,
          download, and — for editing roles — Edit and Make Official), and <strong>Manage</strong>{' '}
          (housekeeping and people, showing only the functions your role has).
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
          any other retained version — and, when there is more than one, a <em>Compare</em> button
          that shows two versions side by side with removals in red and additions in green. Teachers
          do not use the admin area and do not see editing controls.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Browse lesson plans:</strong> the home page groups lessons by subject-grade, strand,
            and sub-strand in curriculum order.
          </li>
          <li>
            <strong>Search &amp; filter:</strong> use the search box to find a subject, grade, strand,
            or sub-strand, and the subject / grade buttons under it to narrow the whole list. They
            combine — e.g. filter to Biology Grade 10, then search within it.
          </li>
          <li>
            <strong>Favorites:</strong> click the star on a library row — or the{' '}
            <em>☆ Favorite</em> button on a lesson page — to pin that version of the lesson to a My
            favorites list at the top of the home page. A favorite keeps pointing at the version you
            starred, even if a newer one later becomes Official. Favorites are personal — only you
            see yours.
          </li>
          <li>
            <strong>Read on screen:</strong> open a sub-strand to view the Lesson Sequence, Final
            Explanation, and Summary Table when those documents are present.
          </li>
          <li>
            <strong>Open or download a document:</strong> every lesson row (and every lesson page)
            lists its documents — Lesson plan, and where present Final explanation and Summary table —
            each with two small buttons. <em>PDF</em> opens the document in a new browser tab;{' '}
            <em>Word</em> downloads the .docx to your device. <em>Download all</em> on a lesson page
            fetches every document at once as a .zip.
          </li>
          <li>
            <strong>Email:</strong> use the Email button to send the generated documents (as a .zip of
            Word files) to any email address — your own, or a colleague&apos;s. Sends are limited per
            day.
          </li>
          <li>
            <strong>Messages:</strong> open <em>Messages</em> from the menu under your avatar (top
            right) to send a note to any user of the repository — a lesson page&apos;s &ldquo;Message a
            colleague&rdquo; link attaches that lesson to your note. Each message you receive has a{' '}
            <em>Reply</em> button that opens a box to write straight back. Unread messages show as a
            small count on your avatar, and you get a short email telling you a message is waiting
            (never its content). Opening Messages marks everything shown as read.
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
            <strong>Edit from the lesson:</strong> open a lesson in the library and press
            <em> Edit</em>. The editing page opens ready to type, showing only the fields you may
            change; <em>← Back to lesson</em> returns you when you are done.
          </li>
          <li>
            <strong>Saving makes a new version:</strong> <em>Save</em> stores your edits as a new
            version of the lesson plan — the version you opened is never changed in place. A Subject
            or Site Administrator marks a saved version Official when it is ready.
          </li>
          <li>
            <strong>Your drafts live in Manage:</strong> <em>Manage → My saved versions</em> lists the
            versions you have saved — click one to continue editing, or delete the ones you no longer
            need.
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
            <strong>Make Official:</strong> on a lesson page, promote a saved version to the Official
            one Teachers see — optionally deleting the version it replaces.
          </li>
          <li>
            <strong>Tidy candidates:</strong> <em>Manage → Candidate versions</em> lists every saved,
            non-Official version in their subject-grades, with delete.
          </li>
          <li>
            <strong>Appoint Editors:</strong> <em>Manage → Editors</em> promotes a Teacher to Editor
            (or removes one) per subject-grade.
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
            <strong>Everything lives on Manage:</strong> upload lesson plans (each upload creates a
            lesson plan and its first Official version), repair plans that have no Official version,
            delete lesson plans (with all their versions), and reach the People and Curriculum lists.
          </li>
          <li>
            <strong>Manage people:</strong> create users, grant Site Administrator access, and assign
            Editor or Subject Administrator roles by subject-grade.
          </li>
          <li>
            <strong>Manage curriculum:</strong> maintain Subjects and Subject Grades before lesson
            plans are uploaded.
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
