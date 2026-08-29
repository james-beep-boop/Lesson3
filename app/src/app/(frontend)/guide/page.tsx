import React from 'react'

import { requireUser } from '@/lib/session'
import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'

export default async function UserGuidePage() {
  await requireUser()

  return (
    <article className="guide">
      <header className="guide-intro">
        <PageHeader
          title="ARES Lesson Plans"
          kicker={<p className="guide-kicker">User guide</p>}
          actions={<PageBackLink href="/" label="Back to lesson plans" />}
        />
        <p>
          The repository stores ARES lesson plans as structured lesson data. You browse, edit,
          preview, and export that data in the app; the system generates the Word and PDF documents
          for you.
        </p>
        <p>
          The main areas are <strong>Lessons</strong> (the library — the one list of every lesson
          plan), the <strong>lesson page</strong> (read, favorite, download, email, and share one
          lesson), <strong>Manage</strong> (editing, housekeeping, and people functions available to
          your role), and <strong>Messages</strong> (notes between repository users). Teachers with
          editing access also see version and comparison controls on the library and lesson pages.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Guide sections">
        <a href="#teachers">Teachers</a>
        {/* Anchor id stays #editors so existing links don't break; the label reframes to "Editing". */}
        <a href="#editors">Editing</a>
        <a href="#subject-admins">Subject-grade administrators</a>
        <a href="#site-admins">Site administrators</a>
        <a href="#writing">Writing in fields</a>
      </nav>

      <section id="teachers" className="guide-section">
        <h2>Teachers</h2>
        {/* Version-history mechanics live in the Editing section (critique 2026-07-12 §4) — Teachers
            have no version selector, so the chip/Compare explanation was noise here. Precisely:
            version reads still run under the caller's Payload access (`overrideAccess: false` in
            `lib/readBundle.ts`); "Official" is just the default + trust marker, NOT an extra
            role/scope gate on top of that. The previous wording ("Teachers see only Official") implied
            a permission boundary that does not exist — don't restore it, and don't over-correct to
            "versions are ungated" either (2026-07-21 review). */}
        <p>
          Teachers use the Lesson Plans area to find lesson plans, read them on screen, and download
          the generated documents. Each lesson plan opens at its Official version — the one current,
          approved copy. Teachers get no version or editing controls.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Your account:</strong> create one from the sign-in page’s <em>Sign up</em> link,
            then follow the verification link we email you before signing in — verified accounts can
            read and download everything. <em>Forgot password?</em> on the same page emails you a
            reset link. If your school’s installation cannot send email — some run with no internet
            — ask a Site administrator instead: they can create a reset link and give it to you
            directly. For security your session ends after a while and signs you out automatically —
            just sign in again to continue.
          </li>
          <li>
            <strong>Browse lesson plans:</strong> the home page groups lessons by subject-grade,
            strand, and sub-strand in curriculum order.
          </li>
          <li>
            <strong>Search &amp; filter:</strong> use the search box to find a subject, grade,
            strand, or sub-strand, and the subject / grade buttons under it to narrow the whole
            list. They combine — e.g. filter to Biology Grade 10, then search within it.
          </li>
          <li>
            <strong>Favorites:</strong> click the star on a library row — or the <em>☆ Favorite</em>{' '}
            button on a lesson page — to keep that lesson in a My favorites list at the top of the
            home page. Your star always shows the lesson’s current Official version, even when a
            newer one is promoted later. (If you have editing access the star works differently: it
            pins the exact version you starred.) Favorites are personal — only you see yours.
          </li>
          <li>
            <strong>Read on screen:</strong> open a sub-strand to view the Lesson Sequence, Final
            Explanation, and Summary Table when those documents are present.
          </li>
          <li>
            <strong>Open or download a document:</strong> on the home page, every lesson row has{' '}
            <em>PDF</em> and <em>Word</em> buttons for its lesson plan — <em>PDF</em> opens in a new
            browser tab, <em>Word</em> downloads the .docx (on a phone, Word is available by email
            instead) — and any Final explanation or Summary table sit behind a{' '}
            <em>Supporting documents</em> line. On a lesson page, all downloads live in the{' '}
            <em>Share</em> menu: each document on its own under <em>Download one document</em>, plus{' '}
            <em>Download all</em> as a Word or PDF .zip. On a phone the Word downloads are omitted —
            use <em>Email all — Word</em>, or a larger screen.
          </li>
          <li>
            <strong>Email:</strong> choose <em>Share → Email all — Word</em> or{' '}
            <em>Email all — PDF</em>
            on a lesson page to send the generated documents (as a .zip of that format) to any email
            address — your own, or a colleague’s. Sends are limited per day.
          </li>
          <li>
            <strong>Want to edit?</strong> use <em>Request editing access</em> on any lesson page —
            it messages the right administrators for you (once per subject per day). If they grant
            it, the editing controls appear for that subject-grade.
          </li>
          <li>
            <strong>Messages:</strong> open <em>Messages</em> from the menu under your avatar (top
            right) to send a note to any user of the repository — a lesson page’s{' '}
            <em>Share → Message a colleague</em> item attaches that lesson to your note. Each
            message you receive has a <em>Reply</em> button that opens a box to write straight back.
            Unread messages show as a small count on your avatar, and you get a short email telling
            you a message is waiting (never its content). Opening Messages marks everything shown as
            read.
          </li>
        </ul>
      </section>

      {/* Anchor id stays #editors (existing links); the section is titled "Editing" and framed as a
          capability teachers are granted, not a separate user type (DESIGN-user-model-language). */}
      <section id="editors" className="guide-section">
        <h2>Editing</h2>
        <p>
          A teacher with editing access can do everything any teacher can, plus edit the prose
          fields for the subject-grades they have been granted — lesson titles, specific learning
          outcomes, overviews, learner experiences, teacher moves, sensemaking strategies, formative
          assessments, teacher reflections, summary-table text, and Final Explanation prompts. They
          never edit a Word file directly.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Edit from the lesson:</strong> open a lesson in the library and press
            <em> Edit</em>. The editing page opens ready to type: the fields you can change are
            editable, and any you cannot are shown but marked <em>read-only</em>.{' '}
            <em>Quick preview ↗</em> checks your content, while <em>Formatted PDF ↗</em> shows the
            final layout. Both open in a new tab and include unsaved edits; close that tab to return
            to the editor. Use <em>Help</em> for the short writing rules. The prominent{' '}
            <em>← Back to lesson</em> button at the top right returns you when you are done.
          </li>
          <li>
            <strong>Saving makes a new version:</strong> <em>Save</em> stores your edits as a new
            version of the lesson plan — the version you opened is never changed in place. A
            Subject-grade or Site administrator marks a saved version Official when it is ready.
          </li>
          <li>
            <strong>Your drafts live in Manage:</strong>{' '}
            <em>Manage → Lesson plans → My saved versions</em> lists the versions you have saved —
            click one to continue editing, or delete the ones you no longer need.
          </li>
          <li>
            <strong>Browse version history:</strong> a <em>N versions</em> chip (on library rows and
            the lesson page) opens a panel listing every retained version — newest first, Official
            pinned on top, with each version’s author, date, and favorite star. When there is more
            than one version, a <em>Compare</em> button shows two versions side by side with
            removals in red and additions in green.
          </li>
          <li>
            <strong>Unsaved work is backed up for you:</strong> while you edit, a notice under the
            buttons shows when your unsaved changes were last backed up. The backup is yours alone —
            nobody else can see it, not even someone signing in on the same computer — and it is
            never applied automatically.
          </li>
          <li>
            <strong>Coming back to unsaved work:</strong> if you leave the editor without saving,
            the next time you open that version you are offered those changes back. The panel lists
            only what differs from the saved version, and shows each change word by word: your
            unsaved wording in green, what the saved version says struck through in red. A change
            that cannot be shown that way is named instead — <em>Emptied</em> where the field would
            be cleared, <em>Paragraph breaks changed</em> where only the line breaks moved,{' '}
            <em>Spacing only</em> where nothing visible differs. Then choose to put the changes
            back, decide later, or discard them; discarding cannot be undone.
          </li>
          <li>
            <strong>If someone else saved in the meantime:</strong> your changes cannot be put back
            automatically, because the lesson plan moved underneath them. They are still shown in
            full so you can read them and copy across whatever you still want.
          </li>
          <li>
            <strong>Find what changed:</strong> Compare works area by area — a lesson’s outcomes,
            overview, implementation framework, teacher reflection and summary prompts are each
            compared on their own. The page opens with a count of the changed areas and a list you
            can click to jump straight to any of them, and shows only the areas that changed. Turn
            off <em>Changes only</em> to read the two versions in full. An area marked{' '}
            <em>Spacing or document structure changed</em> differs only in how the text is broken up
            — the wording is the same, which is why nothing in it is coloured.
          </li>
        </ul>
      </section>

      <section id="subject-admins" className="guide-section">
        <h2>Subject-grade administrators</h2>
        <p>
          A Subject-grade administrator can do everything a teacher with editing access can, for
          their assigned subject-grades. They also manage the structure and official content
          controls for those subject-grades.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Manage structure:</strong> add, remove, and reorder lessons and instructional
            phases. To add a lesson, duplicate an existing lesson row, then edit the copy.
          </li>
          <li>
            <strong>Edit controlled fields:</strong> update Document settings, the Sub-strand
            overview, lesson duration, ARES keywords, phase choices, assessment exemplars, and
            rubric rows.
          </li>
          <li>
            <strong>Make Official:</strong> on a lesson page, promote a saved version to the
            Official one Teachers see — optionally deleting the version it replaces.
          </li>
          <li>
            <strong>Tidy candidates:</strong> <em>Manage → Lesson plans → Candidate versions</em>{' '}
            lists every saved, non-Official version in their subject-grades, with delete. The
            section appears once there is something to tidy.
          </li>
          <li>
            <strong>Roles &amp; Access:</strong> <em>Manage → Users → Roles &amp; Access</em> gives
            a teacher editing access, or removes it, per subject-grade. It also shows who
            administers each of your subject-grades, and the addresses of the people listed there —
            granting access is a permission decision, and two teachers can share a display name.
          </li>
          <li>
            <strong>Hand administration over:</strong> in the same panel you can make one of your
            subject-grade’s existing editors its Subject-grade administrator. You are demoted to
            editing access in the same step, and only a Site administrator can give it back — so the
            panel asks you to confirm before it happens. Whoever you hand it to must already have
            editing access there, which keeps the choice to people already trusted with that
            subject-grade’s content.
          </li>
        </ul>
      </section>

      <section id="site-admins" className="guide-section">
        <h2>Site administrators</h2>
        <p>
          Site administrators have full access across the repository. They manage users, curriculum
          taxonomy, lesson-plan upload/import, and all lesson plans.
        </p>
        <ul className="guide-list">
          <li>
            <strong>Everything lives on Manage:</strong> upload lesson plans (each upload creates a
            lesson plan and its first Official version), repair plans that have no Official version,
            delete lesson plans (with all their versions), and reach the Users and Curriculum lists.
          </li>
          <li>
            <strong>Manage people:</strong> create users, grant Site administrator access, and grant
            editing access or Subject-grade administrator access by subject-grade. Site
            administrators are also the only ones who can <strong>remove</strong> a Subject-grade
            administrator: an administrator may hand the role on, but nobody can take it away from
            them, and nobody can resign it.
          </li>
          <li>
            <strong>Reset a password by hand:</strong> where email is not set up, you can create a
            one-time reset link for an account and hand it over. You never see or choose the
            password — the person sets their own through the normal reset page.
          </li>
          <li>
            <strong>See what this installation is:</strong> Manage → System reports the address,
            whether email and public sharing are available, whether PDF output is working, and when
            a backup last succeeded. Everything there is read-only: those are decided on the server,
            so changing one is a server job, not a click.
          </li>
          <li>
            <strong>Manage curriculum:</strong> maintain Subjects and Subject Grades before lesson
            plans are uploaded.
          </li>
          <li>
            <strong>Review everything:</strong> inspect, edit, export, mark Official, or delete
            lesson plans across all subjects and grades.
          </li>
        </ul>
      </section>

      <section id="writing" className="guide-section">
        <h2>Writing in Fields</h2>
        <p>
          These rules are also available from <em>Help</em> at the top of the editor.
        </p>
        <ul className="guide-list">
          <li>Start a new line to make a new paragraph.</li>
          <li>
            Start a line with <code>- </code> to make a bullet.
          </li>
          <li>
            Use <em>Insert link</em> beneath a prose field to insert an internet address or choose a
            PDF already on the Rock. The address appears in parentheses and becomes clickable in the
            on-screen view and generated Word/PDF documents. Web and PDF links open separately so
            your editor stays open.
          </li>
          <li>Bold, italics, and underlining are not supported.</li>
          <li>
            Edit the field that matches the document section you want to change. The exported DOCX
            and PDF are generated from those fields.
          </li>
        </ul>
      </section>

      <footer className="guide-footer">
        <div className="guide-footer__credit">
          <span>
            Lesson Plans by{' '}
            <a href="https://areseducation.org" target="_blank" rel="noopener noreferrer">
              ARES Education
            </a>{' '}
            and{' '}
            <a href="https://www.seavuria.org" target="_blank" rel="noopener noreferrer">
              Seavuria
            </a>
          </span>
          <span className="guide-footer__support">Help both organizations continue this work.</span>
          <div className="guide-footer__actions">
            <a
              className="btn guide-footer__donate"
              href="https://areseducation.org/donate.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Donate to ARES Education
            </a>
            <a
              className="btn guide-footer__donate"
              href="https://www.seavuria.org/donate"
              target="_blank"
              rel="noopener noreferrer"
            >
              Donate to Seavuria
            </a>
          </div>
        </div>
      </footer>
    </article>
  )
}
