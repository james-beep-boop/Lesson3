import React from 'react'

import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import { GuideAccordion, GuideAccordionPanel } from '@/components/Guide/Accordion'
import { computeGuideAvailablePanels } from '@/components/Guide/availability'
import { resolveGuidePanelState, type GuidePanelId } from '@/components/Guide/panelState'
import { requireUser } from '@/lib/session'

type UserGuidePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UserGuidePage({ searchParams }: UserGuidePageProps) {
  const [{ user }, params] = await Promise.all([requireUser(), searchParams])
  const available = computeGuideAvailablePanels(user)
  const { open, focusTarget } = resolveGuidePanelState(params, available)
  const can = (id: GuidePanelId) => available.includes(id)

  return (
    <article className="guide">
      <header className="guide-intro">
        <PageHeader
          title="ARES Lesson Plans"
          kicker={<p className="guide-kicker">User guide</p>}
          actions={<PageBackLink href="/" label="Back to lesson plans" />}
        />
        <p>
          Follow the steps for the task you want to complete. Your access applies to particular
          subject-grades, so the editing and administrator tasks below appear when you have those
          permissions.
        </p>
        <p>
          The main areas are <strong>Lessons</strong> (the library — the one list of every lesson
          plan), the <strong>lesson page</strong> (read, favorite, download, email, and share one
          lesson), <strong>Manage</strong> (editing, housekeeping, and people functions available to
          your role), and <strong>Messages</strong> (notes between repository users).
        </p>
      </header>

      <GuideAccordion available={available} initialOpen={open} focusTarget={focusTarget}>
        <div className="guide-accordion">
          <GuideAccordionPanel
            id="teachers"
            title="Teachers"
            subtitle="Find, read, save, and share lesson plans."
            anchorId="teachers"
          >
            <p>
              Every signed-in user can use these lesson-library tasks. A Teacher is the starting
              access level; you may also have editing access in one or more subject-grades.
            </p>

            {can('teachers.sign-in') && (
              <GuideAccordionPanel id="teachers.sign-in" title="Sign in or manage your account">
                <p>To create and use your account:</p>
                <ol className="guide-steps">
                  <li>
                    Choose <em>Sign up</em> on the sign-in page and follow the verification link we
                    email you.
                  </li>
                  <li>
                    Sign in with your verified account. Use <em>Forgot password?</em> if you need a
                    reset link.
                  </li>
                  <li>
                    If this installation cannot send email, ask a Site administrator to create and
                    verify your account, or create a reset link and give it to you directly.
                  </li>
                </ol>
                <p>
                  For security, your session ends after a while and signs you out automatically.
                  Sign in again to continue.
                </p>
              </GuideAccordionPanel>
            )}

            {can('teachers.find-read') && (
              <GuideAccordionPanel id="teachers.find-read" title="Find and read a lesson">
                <ol className="guide-steps">
                  <li>
                    Open <em>Lessons</em>. The library is grouped by subject-grade, strand, and
                    sub-strand in curriculum order.
                  </li>
                  <li>
                    Enter a subject, grade, strand, or sub-strand in the search box. Use the subject
                    and grade buttons to narrow the results; search and filters work together.
                  </li>
                  <li>
                    Open a sub-strand to read its Lesson Sequence, Final Explanation, and Summary
                    Table when those documents are present.
                  </li>
                  <li>Open a lesson page to read the lesson and see its available actions.</li>
                </ol>
                <p>Each lesson opens at its Official version — the current approved copy.</p>
              </GuideAccordionPanel>
            )}

            {can('teachers.favorites') && (
              <GuideAccordionPanel id="teachers.favorites" title="Save a favorite">
                <ol className="guide-steps">
                  <li>
                    Select the star on a library row or choose <em>☆ Favorite</em> on the lesson
                    page.
                  </li>
                  <li>
                    Find the lesson later in <em>My favorites</em> at the top of the home page.
                  </li>
                </ol>
                <p>
                  Favorites are personal — only you see yours. For Teachers, the favorite follows
                  the lesson’s current Official version when a newer one is promoted. If you have
                  editing access, a favorite pins the exact version starred and a non-Official pin
                  is labelled <code>vX (pinned)</code>.
                </p>
              </GuideAccordionPanel>
            )}

            {can('teachers.documents') && (
              <GuideAccordionPanel
                id="teachers.documents"
                title="Download, email, or share documents"
              >
                <p>On a lesson page:</p>
                <ol className="guide-steps">
                  <li>
                    The lesson page has its own PDF and Word buttons for the lesson plan in the
                    action bar. PDF opens in a new tab; Word downloads a .docx file.
                  </li>
                  <li>
                    Choose <em>Share</em> for supporting documents, <em>Download all</em> as a Word
                    or PDF .zip, or <em>Email all</em> to send the generated documents to an email
                    address.
                  </li>
                  <li>
                    Choose <em>Share → Message a colleague</em> to send a repository user a note
                    with the lesson attached.
                  </li>
                </ol>
                <p>
                  On the library page, each lesson row has its own PDF and Word buttons; supporting
                  documents appear behind <em>Supporting documents</em>. On a phone, Word downloads
                  are omitted — use <em>Email all — Word</em> or a larger screen. Email sends are
                  limited per day.
                </p>
              </GuideAccordionPanel>
            )}

            {can('teachers.messages') && (
              <GuideAccordionPanel id="teachers.messages" title="Send and reply to messages">
                <ol className="guide-steps">
                  <li>
                    Open <em>Messages</em> from the menu under your avatar.
                  </li>
                  <li>
                    Choose a repository user and write your note. A lesson page’s{' '}
                    <em>Share → Message a colleague</em> item attaches that lesson.
                  </li>
                  <li>
                    Choose <em>Reply</em> on a message you receive to write back.
                  </li>
                </ol>
                <p>
                  Unread messages show as a count on your avatar. You get a short email saying a
                  message is waiting, never its content. Opening Messages marks everything shown as
                  read.
                </p>
              </GuideAccordionPanel>
            )}

            {can('teachers.request-editing') && (
              <GuideAccordionPanel id="teachers.request-editing" title="Request editing access">
                <ol className="guide-steps">
                  <li>Open the lesson in the subject-grade you want to edit.</li>
                  <li>
                    Choose <em>Request editing access</em> on the lesson page.
                  </li>
                  <li>
                    The app messages the appropriate administrators. If they grant access, editing
                    controls appear for that subject-grade.
                  </li>
                </ol>
                <p>
                  Requests are limited to once per subject-grade per day, per teacher — a different
                  teacher requesting the same subject-grade is not affected.
                </p>
                <p>
                  <a href="/guide?open=editing" target="_blank" rel="noopener noreferrer">
                    See what editing access lets you do
                  </a>
                  .
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="editing"
            title="Editing"
            subtitle="Edit lesson prose and work with saved versions when you have editing access."
            anchorId="editors"
          >
            <p>
              Editing access is a capability granted for particular subject-grades. Subject-grade
              and Site administrators can also edit. Teachers with editing access can change lesson
              titles, specific learning outcomes, overviews, learner experiences, teacher moves,
              sensemaking strategies, formative assessments, teacher reflections, summary-table
              text, and Final Explanation prompts. You never edit a Word file directly.
            </p>

            {can('editing.open-edit') && (
              <GuideAccordionPanel id="editing.open-edit" title="Open a lesson for editing">
                <ol className="guide-steps">
                  <li>Open a lesson in a subject-grade where you have editing access.</li>
                  <li>
                    Choose <em>Edit</em>. The editing page opens ready to type, showing only the
                    fields you may change.
                  </li>
                  <li>
                    Enter your changes in the field that matches the document section you want to
                    update.
                  </li>
                  <li>
                    Choose <em>Quick preview ↗</em> to check the content or <em>Formatted PDF ↗</em>{' '}
                    to check the final layout. Each opens in a new tab and includes unsaved edits.
                  </li>
                </ol>
                <p>
                  Close a preview tab to return to the editor. Choose <em>Back</em> at the top right
                  when you are done.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.save') && (
              <GuideAccordionPanel id="editing.save" title="Save your edits as a new version">
                <ol className="guide-steps">
                  <li>Review your changes in Quick preview or Formatted PDF.</li>
                  <li>
                    Choose <em>Save</em>. Lesson3 stores your edits as a new version; it never
                    changes the version you opened in place.
                  </li>
                  <li>
                    A Subject-grade or Site administrator can mark the saved version Official when
                    it is ready.
                  </li>
                </ol>
                <p>
                  Your saved versions are in <em>Manage → Lesson plans → My saved versions</em>.
                  Choose one to continue editing or delete one you no longer need.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.saved-versions') && (
              <GuideAccordionPanel
                id="editing.saved-versions"
                title="Find a saved version or compare versions"
              >
                <p>
                  The <em>N versions</em> panel on library rows and lesson pages lists retained
                  versions, newest first, with Official pinned on top. Each row shows its author,
                  date, and favorite star. Choose <em>Compare</em> when more than one version is
                  available.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.recovery') && (
              <GuideAccordionPanel id="editing.recovery" title="Recover unsaved work">
                <p>
                  While you edit, a notice under the buttons shows when your unsaved changes were
                  last backed up. The backup is yours alone — nobody else can see it, not even
                  someone signing in on the same computer — and it is never applied automatically.
                </p>
                <ol className="guide-steps">
                  <li>
                    If you leave without saving, reopen that version to see the recovery offer.
                  </li>
                  <li>
                    Review the listed differences. Your unsaved wording is green; saved wording
                    being replaced is struck through in red.
                  </li>
                  <li>
                    Choose to restore the changes, decide later, or discard them. Discarding cannot
                    be undone.
                  </li>
                </ol>
                <p>
                  Changes that cannot be shown word by word are labelled <em>Emptied</em> when a
                  field would be cleared, <em>Paragraph breaks changed</em> when only line breaks
                  moved, or <em>Spacing only</em> when no visible wording differs. If someone else
                  saved in the meantime, your changes cannot be put back automatically; they remain
                  visible in full so you can copy what you still want. When the recovery offer
                  compares work against the saved version, it shows only what differs from the saved
                  version.
                </p>
                <p>The final action is permanent — discarding cannot be undone.</p>
              </GuideAccordionPanel>
            )}

            {can('editing.compare') && (
              <GuideAccordionPanel id="editing.compare" title="Compare two versions">
                <ol className="guide-steps">
                  <li>
                    Open the <em>N versions</em> panel and choose <em>Compare</em>.
                  </li>
                  <li>
                    Review the count and list of changed areas, then choose an area to jump to it.
                  </li>
                  <li>
                    Use <em>Changes only</em> to show changed areas, or turn it off to read both
                    versions in full.
                  </li>
                </ol>
                <p>
                  Removals are red and additions are green. An area marked{' '}
                  <em>Spacing or document structure changed</em> has the same wording broken up
                  differently, so no text is coloured. Areas are compared separately: outcomes,
                  overview, implementation framework, teacher reflection, and summary prompts.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.writing') && (
              <GuideAccordionPanel
                id="editing.writing"
                title="Write in lesson fields"
                anchorId="writing"
              >
                <ul className="guide-list">
                  <li>Start a new line to make a new paragraph.</li>
                  <li>
                    Start a line with <code>- </code> to make a bullet.
                  </li>
                  <li>
                    Use <em>Insert link</em> beneath a prose field to insert an internet address or
                    choose a PDF already on the Rock. The address appears in parentheses and becomes
                    clickable in the on-screen view and generated Word/PDF documents. Web and PDF
                    links open separately so your editor stays open.
                  </li>
                  <li>Bold, italics, and underlining are not supported.</li>
                  <li>
                    Edit the field that matches the document section you want to change. The
                    exported DOCX and PDF are generated from those fields.
                  </li>
                </ul>
                <p>
                  <a
                    href="/guide?open=editing&at=editing.writing"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open these writing rules in the full guide
                  </a>
                  .
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="subject-admins"
            title="Subject-grade administrators"
            subtitle="Manage lesson structure, access, and Official versions in assigned subject-grades."
            anchorId="subject-admins"
          >
            <p>
              A Subject-grade administrator can do everything a teacher with editing access can, for
              their assigned subject-grades. They also manage the structure and official content
              controls for those subject-grades.
            </p>

            {can('subject-admins.promote') && (
              <GuideAccordionPanel
                id="subject-admins.promote"
                title="Review a candidate and make it Official"
              >
                <ol className="guide-steps">
                  <li>
                    Open the lesson page and review the saved versions in the <em>N versions</em>{' '}
                    panel.
                  </li>
                  <li>
                    Use <em>Compare</em> to review changes when more than one version is available.
                  </li>
                  <li>
                    Choose the version that is ready, then choose <em>Make Official</em>.
                  </li>
                  <li>
                    Review the confirmation carefully. You may optionally delete the version being
                    replaced.
                  </li>
                </ol>
                <p>The Official version is the one Teachers see by default.</p>
              </GuideAccordionPanel>
            )}

            {can('subject-admins.structure') && (
              <GuideAccordionPanel
                id="subject-admins.structure"
                title="Manage lesson structure and controlled fields"
              >
                <ul className="guide-list">
                  <li>Add a lesson by duplicating an existing lesson row, then edit the copy.</li>
                  <li>Add, remove, and reorder lessons and instructional phases.</li>
                  <li>
                    Update Document settings, the Sub-strand overview, lesson duration, ARES
                    keywords, phase choices, assessment exemplars, and rubric rows.
                  </li>
                </ul>
              </GuideAccordionPanel>
            )}

            {can('subject-admins.candidates') && (
              <GuideAccordionPanel id="subject-admins.candidates" title="Review candidate versions">
                <p>
                  <em>Manage → Lesson plans → Candidate versions</em> lists saved, non-Official
                  versions in your subject-grades. Open one to review it or delete one that is no
                  longer needed. The section appears when there is something to tidy.
                </p>
              </GuideAccordionPanel>
            )}

            {can('subject-admins.access') && (
              <GuideAccordionPanel
                id="subject-admins.access"
                title="Grant or remove editing access"
              >
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Users → Roles &amp; Access</em>.
                  </li>
                  <li>Find the subject-grade you administer or need to manage.</li>
                  <li>Grant a teacher editing access or remove an existing editing grant.</li>
                </ol>
                <p>
                  The panel shows who administers each subject-grade and the addresses of the people
                  listed there — granting access is a permission decision, and two teachers can
                  share a display name.
                </p>
              </GuideAccordionPanel>
            )}

            {can('subject-admins.handover') && (
              <GuideAccordionPanel
                id="subject-admins.handover"
                title="Hand administration to another person"
              >
                <ol className="guide-steps">
                  <li>
                    In <em>Roles &amp; Access</em>, choose an existing editor for your
                    subject-grade.
                  </li>
                  <li>Review the handover confirmation before continuing.</li>
                  <li>
                    Confirm to make them the Subject-grade administrator. You are demoted to editing
                    access in the same step.
                  </li>
                </ol>
                <p>
                  Whoever you hand it to must already have editing access there; only a Site
                  administrator can give it back, so check the choice carefully.
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="site-admins"
            title="Site administrators"
            subtitle="Manage accounts, curriculum, imports, and lesson plans across the repository."
            anchorId="site-admins"
          >
            <p>
              Site administrators have full access across the repository. They manage users,
              curriculum taxonomy, lesson-plan upload/import, and all lesson plans.
            </p>

            {can('site-admins.first-admin') && (
              <GuideAccordionPanel
                id="site-admins.first-admin"
                title="Set up the first Site administrator"
              >
                <p>
                  A completely empty installation shows a one-time{' '}
                  <em>Create the first Site administrator</em> form at <em>/login</em>. There are no
                  default credentials, and the address and password are not stored in <em>.env</em>.
                  After creating the first account, create and test a second Site administrator so
                  one forgotten password cannot leave the site without an administrator.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.accounts') && (
              <GuideAccordionPanel id="site-admins.accounts" title="Create and verify an account">
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Users → Accounts</em> and choose <em>Create user</em>.
                  </li>
                  <li>Enter the account details and save the new user.</li>
                  <li>
                    Open the account and choose <em>Mark verified</em>. The person cannot sign in
                    until that is done.
                  </li>
                  <li>
                    Use <em>Make Site Administrator</em> only when the account should have site-wide
                    access. Test a new Site administrator in a private browser window.
                  </li>
                </ol>
              </GuideAccordionPanel>
            )}

            {can('site-admins.passwords') && (
              <GuideAccordionPanel
                id="site-admins.passwords"
                title="Reset a password when email is unavailable"
              >
                <p>
                  Reset a password by hand when email is not set up: create a one-time reset link
                  for the account and give it to the person. You never see or choose their password;
                  they set it themselves through the normal reset page.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.roles') && (
              <GuideAccordionPanel id="site-admins.roles" title="Manage repository roles">
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Users → Roles &amp; Access</em>.
                  </li>
                  <li>
                    Grant Site administrator access when someone needs repository-wide access.
                  </li>
                  <li>
                    Grant editing access or appoint a Subject-grade administrator for each relevant
                    subject-grade.
                  </li>
                  <li>
                    Replace or remove a Subject-grade administrator when needed. Site administrators
                    are the only ones who can remove a Subject-grade administrator; a Subject-grade
                    administrator can hand it to an existing editor but cannot be removed by another
                    Subject-grade admin.
                  </li>
                </ol>
              </GuideAccordionPanel>
            )}

            {can('site-admins.curriculum') && (
              <GuideAccordionPanel id="site-admins.curriculum" title="Set up subjects and grades">
                <p>Maintain Subjects and Subject Grades before lesson plans are uploaded.</p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.upload') && (
              <GuideAccordionPanel id="site-admins.upload" title="Upload lesson plans">
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Lesson plans → Upload lesson plans</em>.
                  </li>
                  <li>Select the lesson-plan files to upload and review the selected files.</li>
                  <li>
                    Submit the upload. Each upload creates a lesson plan and its first Official
                    version.
                  </li>
                </ol>
              </GuideAccordionPanel>
            )}

            {can('site-admins.repair') && (
              <GuideAccordionPanel
                id="site-admins.repair"
                title="Repair a plan with no Official version"
              >
                <p>
                  Use the Repair panel in Manage to review plans that have no Official version and
                  repair the plan that needs one.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.delete') && (
              <GuideAccordionPanel id="site-admins.delete" title="Delete a lesson plan">
                <p>
                  Deleting a lesson plan also deletes all its versions. Confirm the lesson plan and
                  the consequences in the prompt before proceeding.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.system') && (
              <GuideAccordionPanel id="site-admins.system" title="Read installation status">
                <p>
                  <em>Manage → System</em> reports the address, whether email and public sharing are
                  available, whether PDF output is working, where backups are sent, when one last
                  succeeded, and whether <em>Backup recovery</em> says this installation holds its
                  own decryption key.
                </p>
                <p>
                  A recent successful backup means an encrypted copy was sent; it does not prove
                  that it can be restored. This page is read-only. Server settings and backup
                  recovery are operations tasks, not changes made with a click here.
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="role-notes"
            title="Role notes"
            subtitle="Shared definitions for access, Official versions, and account information."
          >
            <ul className="guide-list">
              <li>
                A <strong>subject-grade</strong> is the unit roles attach to, for example Biology
                Grade 10. Biology Grade 10 and Biology Grade 11 are separate scopes.
              </li>
              <li>
                Every lesson plan has one <em>Official</em> version at a time. Teachers open the
                Official version and do not get the version selector — but versions are not
                access-gated, so a direct link to a specific version still opens for any signed-in
                user. Official is the default and the trust marker, not a permission boundary.
              </li>
              <li>
                Teachers with editing access and Subject-grade administrators act only within the
                subject-grades assigned to them; Site administrators can see and manage everything.
              </li>
              <li>
                Email addresses are visible to the account owner and to Site administrators, with{' '}
                <strong>one exception:</strong> in <em>Manage → Users → Roles &amp; Access</em> a
                Subject-grade administrator also sees the addresses of the people listed for their
                own subject-grades. No other screen shows them.
              </li>
            </ul>
          </GuideAccordionPanel>
        </div>
      </GuideAccordion>

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
