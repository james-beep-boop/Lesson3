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
          Choose a task below to see the steps. You’ll only see instructions for tasks you can do.
          Some editing and administrator tasks are limited to particular subjects and grades.
        </p>
        <p>
          Use <strong>Lessons</strong> to find plans, a <strong>lesson page</strong> to read and share
          one plan, <strong>Manage</strong> to edit lessons and manage accounts, and{' '}
          <strong>Messages</strong> to contact other people with Lesson3 accounts.
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
              Anyone who can sign in can use these tasks. You may also have editing access for some
              subjects and grades.
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
                    If this Lesson3 site cannot send email, ask a Site administrator to create and
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
                    Open <em>Lessons</em>. Plans are grouped by subject and grade, then by strand and
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
                <p>Each lesson opens at its Official version — the version currently approved for use.</p>
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
                  Favorites are private. Teachers see the current Official version when one is
                  promoted. With editing access, a favorite stays on the exact version you chose;
                  Lesson3 marks it <code>vX (pinned)</code> so you know it stays on that version.
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
                    Choose <em>Share → Message a colleague</em> to send another Lesson3 user a note
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
                    Choose a person with a Lesson3 account and write your note. A lesson page’s{' '}
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
                  <li>Open the lesson in the subject and grade you want to edit.</li>
                  <li>
                    Choose <em>Request editing access</em> on the lesson page.
                  </li>
                  <li>
                    Lesson3 notifies the administrators for that subject and grade. If they give you
                    access, editing controls appear for those lessons.
                  </li>
                </ol>
                <p>
                  You can request access once a day for each subject and grade. The limit applies
                  separately to each teacher.
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
            subtitle="Edit lesson text and work with saved versions when you have editing access."
            anchorId="editors"
          >
            <p>
              With editing access, you can change most lesson content in Lesson3. The subjects and
              grades you can edit depend on your role. Subject-grade and Site administrators can also
              edit. Make changes in Lesson3, not in a Word file.
            </p>

            {can('editing.open-edit') && (
              <GuideAccordionPanel id="editing.open-edit" title="Open a lesson for editing">
                <ol className="guide-steps">
                  <li>Open a lesson in a subject and grade where you have editing access.</li>
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
                    Choose <em>Save</em>. Lesson3 saves your changes as a new version and leaves the
                    version you opened unchanged.
                  </li>
                  <li>
                    A Subject-grade or Site administrator can mark the saved version Official when
                    it is ready.
                  </li>
                </ol>
                <p>
                  Find your saved versions in <em>Manage → Lesson plans → My saved versions</em>.
                  Choose one to continue editing, or delete one you no longer need.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.saved-versions') && (
              <GuideAccordionPanel
                id="editing.saved-versions"
                title="Find a saved version or compare versions"
              >
                <p>
                  The <em>N versions</em> panel on library rows and lesson pages lists saved versions,
                  newest first, with Official at the top. Each row shows its author, date, and
                  favorite star. Choose <em>Compare</em> when more than one version is available.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.recovery') && (
              <GuideAccordionPanel id="editing.recovery" title="Recover unsaved work">
                <p>
                  While you edit, a note below the buttons shows when Lesson3 last saved a temporary
                  copy of your changes. Only you can see it, even if someone else uses the same
                  computer. Lesson3 will not restore it unless you choose to.
                </p>
                <ol className="guide-steps">
                  <li>
                    If you leave without saving, reopen that version. Lesson3 will ask whether you
                    want to restore your changes.
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
                  Normally, Lesson3 shows only the changes you have not saved. Some changes cannot be
                  shown word by word. <em>Emptied</em> means a field will be cleared;{' '}
                  <em>Paragraph breaks changed</em> means only the line breaks changed; and{' '}
                  <em>Spacing only</em> means the words stayed the same. If someone else saves a newer
                  version while you are away, Lesson3 cannot restore your changes automatically. They
                  Lesson3 shows all your unsaved work so you can copy what you still need.
                </p>
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
                  Removals are red and additions are green. If an area is marked{' '}
                  <em>Spacing or document structure changed</em>, the words are the same but arranged
                  differently. Lesson3 compares outcomes, overview, teaching steps, teacher
                  reflection, and summary prompts separately.
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
                    Use <em>Insert link</em> below a text field to add a web address or choose a PDF
                    already available on this Lesson3 site. The address appears in parentheses and
                    becomes clickable on screen and in the Word/PDF files. Web and PDF
                    links open separately so your editor stays open.
                  </li>
                  <li>Bold, italics, and underlining are not supported.</li>
                  <li>
                    Change the field for the section you want to update. Lesson3 makes the Word and
                    PDF files from these fields.
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
            subtitle="Review lesson changes, manage editing access, and update lessons for your subjects and grades."
            anchorId="subject-admins"
          >
            <p>
              Subject-grade administrators can edit lesson text, give or remove editing access,
              change lesson structure, and choose which version is Official for their subjects and
              grades.
            </p>

            {can('subject-admins.promote') && (
              <GuideAccordionPanel
                id="subject-admins.promote"
                title="Review a saved version and make it Official"
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
                title="Manage lesson structure and settings"
              >
                <ul className="guide-list">
                  <li>Add a lesson by duplicating an existing lesson row, then edit the copy.</li>
                  <li>Add, remove, and reorder lessons and instructional phases.</li>
                  <li>
                    Change document settings, the Sub-strand overview, lesson duration, ARES
                    keywords, lesson phases, assessment examples, and rubric rows.
                  </li>
                </ul>
              </GuideAccordionPanel>
            )}

            {can('subject-admins.candidates') && (
              <GuideAccordionPanel id="subject-admins.candidates" title="Review saved versions">
                <p>
                  <em>Manage → Lesson plans → Candidate versions</em> lists saved versions that are
                  not Official for your subjects and grades. Open one to review it, or delete one you
                  no longer need. This section appears only when there are saved versions to review.
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
                  <li>Choose the subject and grade where you want to change access.</li>
                  <li>Grant a teacher editing access or remove an existing editing grant.</li>
                </ol>
                <p>
                  Check the person’s email address before changing access. Two people can have the
                  same display name.
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
                    In <em>Roles &amp; Access</em>, choose someone who already has editing access for
                    this subject and grade.
                  </li>
                  <li>Review the handover confirmation before continuing.</li>
                  <li>
                    Confirm to make them the Subject-grade administrator. You keep editing access,
                    but lose administrator access.
                  </li>
                </ol>
                <p>
                  Only a Site administrator can make you an administrator again, so check your
                  choice carefully.
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="site-admins"
            title="Site administrators"
            subtitle="Manage accounts, subjects, grades, and lesson plans across the site."
            anchorId="site-admins"
          >
            <p>
              Site administrators can manage all accounts, subjects, grades, and lesson plans.
            </p>

            {can('site-admins.first-admin') && (
              <GuideAccordionPanel
                id="site-admins.first-admin"
                title="Set up the first Site administrator"
              >
                <p>
                  If no account exists yet, the sign-in page shows a one-time{' '}
                  <em>Create the first Site administrator</em> form. There is no default username or
                  password.
                  After creating the first account, create and test a second Site administrator so
                  someone can still manage the site if you forget your password.
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
                    Use <em>Make Site Administrator</em> only when the person needs to manage the
                    whole site. Open a private browser window and sign in as the new administrator
                    to check that the account works.
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
                  If email is not available, create a password-reset link and give it to the person.
                  They use the link to choose a new password. You will not see their password.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.roles') && (
              <GuideAccordionPanel id="site-admins.roles" title="Manage user roles">
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Users → Roles &amp; Access</em>.
                  </li>
                  <li>
                    Make someone a Site administrator only if they need to manage the whole site.
                  </li>
                  <li>
                    Give editing access or appoint a Subject-grade administrator for each subject
                    and grade they manage.
                  </li>
                  <li>
                    Only a Site administrator can appoint, replace, or remove a Subject-grade
                    administrator. A Subject-grade administrator can hand over their role to someone
                    who already has editing access, but cannot remove another administrator.
                  </li>
                </ol>
              </GuideAccordionPanel>
            )}

            {can('site-admins.curriculum') && (
              <GuideAccordionPanel id="site-admins.curriculum" title="Set up subjects and grades">
                <p>Add subjects and grades before uploading lesson plans.</p>
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
                title="Fix a plan with no Official version"
              >
                <p>
                  Open the Repair panel in Manage and follow the steps to choose an Official version
                  for the plan.
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
              <GuideAccordionPanel id="site-admins.system" title="Check site and backup status">
                <p>
                  <em>Manage → System</em> shows the site address, whether email and public sharing
                  are available, whether PDFs are working, where backups are sent, when the last
                  backup succeeded, and whether this site keeps the key needed to open its backups.
                </p>
                <p>
                  A successful backup means an encrypted copy was sent. It does not prove the backup
                  can be restored. You cannot change these settings on this page; ask the person who
                  manages the server to change them.
                </p>
              </GuideAccordionPanel>
            )}
          </GuideAccordionPanel>

          <GuideAccordionPanel
            id="role-notes"
            title="Role notes"
            subtitle="Important facts about access, Official versions, and email addresses."
          >
            <ul className="guide-list">
              <li>
                Access is set separately for each subject and grade. For example, access to Biology
                Grade 10 does not include Biology Grade 11.
              </li>
              <li>
                Every lesson plan has one <em>Official</em> version at a time. Teachers open the
                Official version first. It does not control who can open other saved versions. Anyone
                who is signed in can open a saved version if they have its link.
              </li>
              <li>
                Teachers with editing access and Subject-grade administrators can work only with the
                subjects and grades assigned to them. Site administrators can manage the whole site.
              </li>
              <li>
                Only the account owner and Site administrators can see an email address. In{' '}
                <em>Manage → Users → Roles &amp; Access</em>, Subject-grade administrators can see
                addresses only for people listed under the subjects and grades they manage.
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
