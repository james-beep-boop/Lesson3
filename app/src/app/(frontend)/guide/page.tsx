import React from 'react'
import { LINKABLE_FIELD_LIST } from '@/lib/frameworkProse'

import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import AppVersion from '@/components/AppVersion'
import { GuideAccordion, GuideAccordionPanel } from '@/components/Guide/Accordion'
import { computeGuideAvailablePanels } from '@/components/Guide/availability'
import { resolveGuidePanelState, type GuidePanelId } from '@/components/Guide/panelState'
import { requireUser } from '@/lib/session'
import { systemFlagsForRender } from '@/lib/systemFlags'

type UserGuidePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function UserGuidePage({ searchParams }: UserGuidePageProps) {
  const [{ payload, user }, params] = await Promise.all([requireUser(), searchParams])
  const available = computeGuideAvailablePanels(user, await systemFlagsForRender(payload))
  const { open, focusTarget } = resolveGuidePanelState(params, available)
  const can = (id: GuidePanelId) => available.includes(id)

  return (
    <article className="guide">
      <header className="guide-intro">
        <PageHeader
          title="Lesson Plan Editor"
          kicker={<p className="guide-kicker">User guide</p>}
          actions={<PageBackLink href="/" label="Back to lesson plans" />}
        />
        <p>
          Choose a task below to see the steps. You’ll only see instructions for tasks you can do.
          Some editing and administrator tasks are limited to particular subjects and grades.
        </p>
        <p>
          Use <strong>Lessons</strong> to find plans, a <strong>lesson page</strong> to read and
          share one plan, <strong>Manage</strong> to edit lessons and manage accounts, and{' '}
          <strong>Messages</strong> to contact other people with Lesson Plan Editor accounts.
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
                    If this Lesson Plan Editor site cannot send email (most school servers have no
                    internet), the sign-up page says so. Sign up as usual, ask your school’s Site
                    administrator to approve your account, then sign in. They can also create a
                    reset link and give it to you directly.
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
                    Open <em>Lessons</em>. Plans are grouped by subject and grade, then by strand
                    and sub-strand in curriculum order.
                  </li>
                  <li>
                    Enter a subject, grade, strand, or sub-strand in the search box. Use the subject
                    dropdown and grade checkboxes to narrow the results. Select any number of
                    grades, or All for every grade; search and filters work together.
                  </li>
                  <li>
                    Open a sub-strand to read its Lesson Sequence, Final Explanation, and Summary
                    Table when those documents are present.
                  </li>
                  <li>Open a lesson page to read the lesson and see its available actions.</li>
                </ol>
                <p>
                  Each lesson opens at its Official version — the version currently approved for
                  use.
                </p>
                <p>
                  An ARES version shows its release date beside the version number, for example
                  <strong> 2.0.0 · ARES release 14 Nov 2026</strong>.{' '}
                  <strong>ARES release: not stated</strong> means the upload did not supply a
                  release date. Teacher versions have no ARES release label. An{' '}
                  <em>Official updated</em> notice shows when an import changed Official and names
                  the previous Official when it is still available. Its change date is separate from
                  the ARES release date.
                </p>
                <p>
                  Below the version information, choose <em>Show details</em> to see who saved it,
                  its source version, and when it was created and last modified. Choose{' '}
                  <em>Hide details</em> to close the panel. You can inspect details without editing
                  access, including in Standard mode. Missing provenance says <em>Not recorded</em>;
                  a referenced record you cannot read says <em>Unavailable</em>.
                </p>
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
                  Lesson Plan Editor marks it <code>vX (pinned)</code> so you know it stays on that
                  version.
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
                    address. <em>Email all</em> and <em>Download as JSON</em> appear when Advanced
                    tools is switched on, and Email all only when the site can send email.
                  </li>
                  <li>
                    Choose <em>Share → Message a colleague</em> to send another Lesson Plan Editor
                    user a note with the lesson attached.
                  </li>
                </ol>
                <p>
                  On the library page, each lesson row has its own PDF and Word buttons; supporting
                  documents appear behind <em>Supporting documents</em>. On a phone, Word downloads
                  are omitted — use <em>Email all — Word</em> or a larger screen. Email sends are
                  limited per day.
                </p>
                <p>
                  The <em>Final explanation</em> you download has blank answer space and no answers,
                  so it is the one to give to students. The <em>Teacher key — not for students</em>{' '}
                  has the same questions with the exemplar answers: the Teacher key has the exemplar
                  answers and is not for students. It appears beside the Final explanation, wherever
                  one exists, and travels with <em>Download all</em> and <em>Email all</em>.
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
                    Choose a person with a Lesson Plan Editor account and write your note. A lesson
                    page’s <em>Share → Message a colleague</em> item attaches that lesson.
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

            {can('teachers.discussions') && (
              <GuideAccordionPanel id="teachers.discussions" title="Start a discussion and reply">
                <ol className="guide-steps">
                  <li>
                    Open <em>Discuss</em>, choose <em>Start a discussion</em>, and write a title and
                    post. Name the lesson and the question or change.
                  </li>
                  <li>
                    Choose <em>Post</em>. Every signed-in user can read and reply. Write plain text;
                    web links become clickable.
                  </li>
                  <li>
                    Open a thread to reply. Replies appear oldest first. Pinned topics stay above
                    the list of latest activity.
                  </li>
                </ol>
                <p>
                  Search covers titles only. Posts cannot be edited. Only a Site administrator can
                  delete a thread. You can make up to 100 posts per day, including replies.
                </p>
                <p>
                  The blue dot means new posts in discussions you started or replied to, or
                  discussions started about a saved version you authored. Your own replies do not
                  light the dot. A blue marker identifies the unread thread in the list. Reading
                  alone does not subscribe you.
                </p>
                <p>
                  Reading a thread marks the posts shown as read. Follow reply pages in order;
                  jumping ahead leaves earlier posts unread. The dot updates on navigation or
                  reload.
                </p>
                <p>
                  Your forum text stays only in the form. Copy it before leaving, reloading or
                  signing in again. If a result is uncertain, keep the form open and choose{' '}
                  <em>Try again</em>; the fields stay locked until Lesson Plan Editor finds the post
                  or confirms it was posted.
                </p>
              </GuideAccordionPanel>
            )}

            {can('teachers.discussion-references') && (
              <GuideAccordionPanel
                id="teachers.discussion-references"
                title="Add a lesson reference"
              >
                <p>
                  In either composer, choose <em>Add lesson reference</em>, find a lesson by title,
                  then press <em>Add reference</em> for the version you want to attach. You can
                  remove a prefilled reference before posting.
                </p>
                <p>
                  From a lesson page, <em>Share → Discuss this version</em> opens a discussion with
                  that version already attached. <em>Compare changes</em> appears when its source
                  version is still available. If the referenced version is deleted, its label
                  remains with no link to another version.
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
                    Lesson Plan Editor notifies the administrators for that subject and grade. If
                    they give you access, editing controls appear for those lessons.
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
              With editing access, you can change most lesson content in Lesson Plan Editor. The
              subjects and grades you can edit depend on your role. Subject-grade and Site
              administrators can also edit. Make changes in Lesson Plan Editor, not in a Word file.
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
                    Choose <em>Save as new version</em>. Lesson Plan Editor saves your changes as a
                    new version and leaves the version you opened unchanged.
                  </li>
                  <li>
                    A Subject-grade or Site administrator can mark the saved version Official when
                    it is ready.
                  </li>
                </ol>
                <p>
                  Find your saved versions in <em>Manage → Lesson plans → Your saved versions</em>.
                  Choose one to continue editing, or delete one you no longer need. Versions of
                  yours that are Official are listed too, marked Official; they cannot be deleted.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.saved-versions') && (
              <GuideAccordionPanel
                id="editing.saved-versions"
                title="Find a saved version or compare versions"
              >
                <p>
                  The <em>N versions</em> panel on library rows and lesson pages lists saved
                  versions, newest first, with Official at the top. Each row shows its author, date,
                  and favorite star. Choose <em>Compare</em> when more than one version is
                  available.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.recovery') && (
              <GuideAccordionPanel id="editing.recovery" title="Save a draft and continue later">
                <p>
                  A draft is your private copy of changes you have not saved as a new version. While
                  you edit, Lesson Plan Editor saves a draft automatically, and a note below the
                  buttons shows when. Only you can see your drafts, even if someone else uses the
                  same computer, and Lesson Plan Editor never restores a draft unless you choose to.
                </p>
                <p>
                  To stop for now, choose <em>Save as draft</em>. Lesson Plan Editor checks that
                  your draft is saved, then closes the editor. A draft is kept for 30 days after you
                  last worked on it. The <strong>Manage</strong> tab lists your drafts under{' '}
                  <em>Lesson plans → Your drafts</em>, with <em>Continue editing</em> and{' '}
                  <em>Discard</em>; the heading shows how many you have. To throw your changes away
                  instead, choose <em>Discard changes</em>. Administrators: a draft holds only
                  wording, not changes to lessons, phases, durations, rubrics or answer keys.
                </p>
                <ol className="guide-steps">
                  <li>
                    When you have a draft, the <em>Edit</em> button says <em>Continue editing</em>.
                    Choose it, and Lesson Plan Editor asks whether to restore your draft.
                  </li>
                  <li>
                    Review the listed differences. Your draft’s wording is green; saved wording
                    being replaced is struck through in red.
                  </li>
                  <li>
                    Choose <em>Restore my draft</em>, <em>Discard the draft</em>, or{' '}
                    <em>Exit edit mode</em>, which keeps your draft and asks again next time.
                    Discarding cannot be undone.
                  </li>
                </ol>
                <p>
                  Normally, Lesson Plan Editor shows only what your draft changes. Some changes
                  cannot be shown word by word. <em>Emptied</em> means a field will be cleared;{' '}
                  <em>Paragraph breaks changed</em> means only the line breaks changed; and{' '}
                  <em>Spacing only</em> means the words stayed the same.
                </p>
                <p>
                  To bring a draft together with a newer version, save the draft as a version, then
                  use Combine versions.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.compare') && (
              <GuideAccordionPanel id="editing.compare" title="Compare two versions">
                <p>
                  To combine text, open a saved version and choose <em>More → Combine versions</em>.
                  This appears when the plan has at least two versions and you have editing access.
                  Choose another version and <em>Review combination</em>, then{' '}
                  <em>Continue in editor</em>. Lesson Plan Editor may switch versions to preserve
                  the plan details and answer keys. For each remaining field, choose{' '}
                  <em>Use 1.0.1’s text</em> or <em>Write my own</em>. You can change choices until
                  saving. If a comparison fails, choose <em>Retry combination</em>; your text stays
                  on screen. <em>Save as new version</em> saves a Not Official result, keeps both
                  parents, and leaves Official unchanged. Nothing is saved as a numbered version
                  automatically.
                </p>
                <p>
                  A lesson may offer <em>Combine them?</em> when your latest saved version is based
                  on an older ARES release than Official. This opens Combine with your version and
                  the current Official.{' '}
                  <strong>Not now hides the suggestion until you reload the page.</strong> Nothing
                  is saved until you choose to save a version or draft in the editor.
                </p>
                <p>
                  In the editor, Combine versions and Show details appear when Advanced tools is
                  switched on. Ask your Site Administrator if you need them. An unfinished
                  combination can still be restored and saved when Advanced tools is off.
                </p>
                <p>
                  An unfinished combination is captured as a private draft. Restoring reruns the
                  comparison and keeps your text. If the other version has gone, it becomes an
                  ordinary draft. If the comparison cannot load for another reason, choose{' '}
                  <em>Retry combination</em>. Deleting the version you were editing deletes its
                  draft too. If that happens while the editor is open, copy your text before leaving
                  the page.
                </p>

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
                  <em>Spacing or document structure changed</em>, the words are the same but
                  arranged differently. Lesson Plan Editor compares outcomes, overview,
                  implementation framework, teacher reflection, and summary prompts separately.
                </p>
              </GuideAccordionPanel>
            )}

            {can('editing.discuss-changes') && (
              <GuideAccordionPanel id="editing.discuss-changes" title="Discuss your saved changes">
                <p>
                  After saving a version, choose <em>Post about these changes</em> beside{' '}
                  <em>Compare to Official</em> on your saved version. It opens a discussion with
                  that version attached. Explain what changed and invite colleagues’ suggestions.
                </p>
                <p>
                  Starting a discussion that references someone else’s saved version includes its
                  author in the discussion’s blue-dot notifications.
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
                    While editing, place the cursor in {LINKABLE_FIELD_LIST}, then choose Insert
                    link in the toolbar. Copy the address from your browser’s address bar on the
                    ARES page (or any web page), paste it, and add an optional label. Long Kolibri
                    addresses are shortened automatically. To link an ARES PDF, open it in ARES and
                    copy its address. If PDFs on the Rock is shown, you can choose a PDF there
                    instead. The address is inserted in parentheses at the cursor, after your label
                    if supplied. Links become clickable on screen and in Word and PDF documents,
                    except inside table text. Web and PDF links open separately so your editing page
                    stays open. Insert link is hidden during Combine review.
                  </li>
                  <li>Keep web addresses out of the label. Use the Web address box.</li>
                  <li>
                    {
                      'A label can\'t start with "- " or "|". Those turn the line into a bullet or a table.'
                    }
                  </li>
                  <li>Bold, italics, and underlining are not supported.</li>
                  <li>
                    Change the field for the section you want to update. Lesson Plan Editor makes
                    the Word and PDF files from these fields.
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
                    When you add a phase row, choose its phase name from the dropdown. Save checks
                    required fields first and takes you to the first field needing attention. The
                    message identifies its lesson and phase number; your edits stay on screen while
                    you correct it.
                  </li>
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
                  <em>Manage → Lesson plans → Delete individual versions</em> lists saved versions
                  that are not Official for your subjects and grades. Open one to review it, or
                  delete one you no longer need. This section appears only when there are saved
                  versions to review.
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
                    In <em>Roles &amp; Access</em>, choose someone who already has editing access
                    for this subject and grade.
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
            <p>Site administrators can manage all accounts, subjects, grades, and lesson plans.</p>

            {can('site-admins.first-admin') && (
              <GuideAccordionPanel
                id="site-admins.first-admin"
                title="Set up the first Site administrator"
              >
                <p>
                  If no account exists yet, the sign-in page shows a one-time{' '}
                  <em>Create the first Site administrator</em> form. There is no default username or
                  password. After creating the first account, create and test a second Site
                  administrator so someone can still manage the site if you forget your password.
                </p>
                <p>
                  Installing Lesson Plan Editor on a new school server is a job for the technician.
                  They follow the instructions that come with the program. Before they hand the
                  server over, they should:
                </p>
                <ol className="guide-steps">
                  <li>create two Site administrator accounts and check that both can sign in;</li>
                  <li>
                    set the <em>School name</em>;
                  </li>
                  <li>set up backups;</li>
                  <li>upload the ARES lesson plans;</li>
                  <li>open a lesson and check that it downloads as Word and PDF.</li>
                </ol>
                <p>
                  Updating the program later is also a job for the technician. Updating the program
                  does not add new lesson plans: you upload those yourself (see{' '}
                  <em>Upload lesson plans</em>).
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.accounts') && (
              <GuideAccordionPanel id="site-admins.accounts" title="Approve or create an account">
                <p>
                  On a site that cannot send email, teachers who sign up cannot sign in until you
                  approve them. <em>Manage</em> shows how many are waiting.
                </p>
                <ol className="guide-steps">
                  <li>
                    Choose <em>Review them in Accounts</em>, open each waiting account and choose{' '}
                    <em>Approve</em>.
                  </li>
                  <li>
                    To create an account yourself, open <em>Manage → Users → Accounts</em>, choose{' '}
                    <em>Create user</em>, save it, then approve it.
                  </li>
                  <li>
                    On a site that sends email, the same button reads <em>Mark verified</em>. You
                    only need it when someone cannot use their emailed link.
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
                <p>
                  Open <em>Manage → Subjects and grades</em>. Add the subject first, then tick its
                  grade. Use <em>+ Grade</em> to add a grade column from 1–12. The subject name and
                  grade must match the lesson file. An upload can also create missing subjects and
                  grades after asking you.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.upload') && (
              <GuideAccordionPanel id="site-admins.upload" title="Upload lesson plans">
                <p>
                  Uploading adds new ARES lesson plans, or newer versions of ones you already have.
                  You do it in the browser; you do not need the technician.
                </p>
                <ol className="guide-steps">
                  <li>
                    Open <em>Manage → Lesson plans → Upload lesson plans</em>.
                  </li>
                  <li>
                    Choose the ARES lesson ZIP file (or the lesson plan JSON files). You do not need
                    to unzip it.
                  </li>
                  <li>
                    Read the list before you confirm. It shows the lessons that will become
                    Official, the lessons waiting for the subject-grade administrator, and the files
                    that will change nothing. Missing subjects and grades appear in the same
                    confirmation round: tick the ones to create. If a new subject’s name looks like
                    one you already have, say whether it is new or a spelling mistake. A spelling
                    mistake is not created, and its files are rejected so you can correct them.
                  </li>
                  <li>
                    Confirm, then read the report. It lists the files that were imported, skipped or
                    rejected, and gives the reason for each rejected file.
                  </li>
                  <li>
                    If files were rejected, correct them and upload the ZIP again. Files that were
                    already imported are skipped the second time.
                  </li>
                </ol>
                <p>Good to know:</p>
                <ul>
                  <li>Older versions are never deleted. They stay in each lesson’s history.</li>
                  <li>
                    A new lesson plan becomes Official straight away. A newer ARES release replaces
                    an ARES Official once you confirm.
                  </li>
                  <li>
                    A teacher’s Official stays unchanged, waiting for the subject-grade
                    administrator. They decide whether to use the new release.
                  </li>
                  <li>
                    A release dated earlier than the newest one already here is not imported.
                    Uploading the same release again changes nothing, even if a teacher has saved a
                    version since.
                  </li>
                  <li>
                    After the upload, each subject-grade administrator whose lessons changed gets
                    one message from you listing them. A long list ends with “…and N more”; the full
                    list is in the upload report. If a message cannot be sent, the report says so,
                    and the lessons are still imported.
                  </li>
                  <li>
                    Some ZIP files include a file called <em>LESSONS.json</em>. It records the ARES
                    release date and lets the program check that the files arrived undamaged.
                  </li>
                </ul>
                <p>If the list or the report shows a problem:</p>
                <ul>
                  <li>
                    <strong>The lessons need a newer program.</strong> Ask the technician to update
                    Lesson Plan Editor, then upload the same ZIP again.
                  </li>
                  <li>
                    <strong>A file looks damaged.</strong> Get a fresh copy of the ZIP and upload
                    that instead.
                  </li>
                  <li>
                    <strong>The whole set is refused</strong> because an ARES release name was
                    reused for different lessons. Ask ARES for a corrected set.
                  </li>
                  <li>
                    <strong>A lesson matches an older ARES release.</strong> The list marks it
                    before you confirm, so you can leave it out.
                  </li>
                  <li>
                    <strong>The list changed while you were reading it</strong> (for example,
                    someone else uploaded at the same time). Read the new list and confirm again.
                  </li>
                </ul>
              </GuideAccordionPanel>
            )}

            {can('site-admins.repair') && (
              <GuideAccordionPanel
                id="site-admins.repair"
                title="Set an Official version for a plan"
              >
                <p>
                  Open <em>Manage → Lesson plans → Set an Official version</em>. This section
                  appears only when a plan has no Official version selected. Open the plan and
                  choose an available saved version to make Official.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.delete') && (
              <GuideAccordionPanel id="site-admins.delete" title="Delete a lesson plan">
                <p>
                  Open <em>Manage → Lesson plans → Delete a plan (all versions)</em>. Only selected
                  plans are removed, together with every version of each one. Confirm the selected
                  plans and the consequences in the prompt before proceeding.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.system') && (
              <GuideAccordionPanel id="site-admins.system" title="Check site and backup status">
                <p>
                  <em>Manage → System → Installation status</em> shows the site address, whether
                  email and public sharing are available, whether PDFs are working, where backups
                  are sent, when the last backup succeeded, and whether new backups are encrypted
                  for a recovery key held by the school.
                </p>
                <p>
                  A successful backup means an encrypted copy was sent. It does not prove the backup
                  can be restored. <em>Manage → System → Installation status</em> reports status
                  only; it cannot start a backup or restore data. Ask the person who manages the
                  server to change its settings.
                </p>
                <p>
                  If <em>Manage</em> says the server and this device show different times: a school
                  server with no internet cannot set its own clock, and can lose the time after a
                  power cut. Saved dates, draft expiry and sign-in timeouts depend on the server’s
                  clock, so ask the person who manages the server to check its date and time.
                </p>
                <p>
                  In <em>Manage → System → Features</em>, enter the <em>School name</em> and choose
                  <em> Save</em>. Review the change and enter your password. Only a Site
                  administrator can set it. The name appears on sign-in, in browser tabs and the
                  account menu, and under Lesson Plans, Discussions and Manage headings. It never
                  appears in the top bar or generated documents. Leave School name empty to hide it.
                  Names can have up to 80 characters, on one line.
                </p>
                <p>
                  Advanced tools is off by default. In <em>Manage → System → Features</em>, switch
                  on <em>Advanced tools</em> and choose <em>Save</em> to show{' '}
                  <em>Combine versions</em> and <em>Show details</em> in the editor, and{' '}
                  <em>Download as JSON</em> and <em>Email all</em> in a lesson page’s <em>Share</em>{' '}
                  menu. It does not change anyone’s permissions.
                </p>
              </GuideAccordionPanel>
            )}

            {can('site-admins.backups') && (
              <GuideAccordionPanel
                id="site-admins.backups"
                title="Backups and recovery for server operators"
              >
                <p>
                  Being a Site administrator in Lesson Plan Editor does not give you a server login
                  or a recovery key. You can check backups in the browser. Setting them up and
                  recovering data are jobs for the technician; their steps are at the end of this
                  section.
                </p>
                <h4>How backups work</h4>
                <p>
                  Once the technician has set them up, backups happen automatically every night. You
                  do not need to do anything. Each backup is saved in two places:
                </p>
                <ul>
                  <li>
                    <strong>On the server’s own disk.</strong> This copy helps after a mistake, such
                    as a bad update or a deleted lesson. It is lost if the disk breaks, the server
                    is stolen or burned, or the server is wiped and reinstalled.
                  </li>
                  <li>
                    <strong>On the school’s USB backup drive.</strong> Leave the drive plugged into
                    the server so the nightly backup reaches it. When someone can, take it to
                    another building, and plug it back in when it returns. This is the copy that
                    survives if something happens to the server.
                  </li>
                </ul>
                <p>
                  The server must be switched on at night (around 2 a.m.). If it is normally
                  switched off at night, ask the technician to change the backup time.
                </p>
                <h4>Check your backups</h4>
                <p>
                  Open <em>Manage → System → Backups</em>. Each line is one finding:
                </p>
                <ul>
                  <li>
                    <strong>Disk backup</strong> and <strong>USB backup</strong> say “Up to date”
                    when there is a recent copy. Backup up to date is judged by when the backup’s
                    data was taken, not by when it was copied. A school that keeps its copy online
                    instead of on a USB drive sees <strong>Remote backup</strong>.
                  </li>
                  <li>
                    <strong>USB backup: Overdue</strong> means the newest USB copy is more than 30
                    days old. Plug the drive back in; the next nightly backup copies to it. A fresh
                    disk copy never hides an overdue USB copy.
                  </li>
                  <li>
                    <strong>Not connected</strong> is fine while the drive is away, but the drive
                    still needs to come back.
                  </li>
                  <li>
                    <strong>USB backup: None set up</strong> means there is no USB drive. Ask the
                    technician to add one, so that a copy can leave the building.
                  </li>
                  <li>
                    A line saying the <strong>last attempt</strong> failed: tell the technician. One
                    copy failing needs attention even if the other copy worked.
                  </li>
                  <li>
                    <strong>Agreed recovery time</strong> shows how much work the school accepts it
                    could lose, and how quickly it should be working again. The school agrees these
                    with the technician; until then the page says “Not agreed”. A limit of one week
                    means accepting the loss of up to a week’s work.
                  </li>
                  <li>
                    <strong>Full recovery</strong> reads “Not yet tested” until rebuilding the
                    installation on another machine from its backups has been shown to work. This is
                    normal for now.
                  </li>
                  <li>
                    <strong>School recovery key</strong> shows who can open the backups. See below.
                  </li>
                </ul>
                <h4>If you need to recover data</h4>
                <p>
                  Recovering data replaces everything in Lesson Plan Editor with the contents of a
                  backup. It is not a button in the browser: the technician does it. Before you call
                  them, look at <strong>School recovery key</strong> on the Backups page:
                </p>
                <ul>
                  <li>
                    <strong>Password-locked (set up …)</strong> — the technician needs the backup
                    drive and the password from the recovery sheet. ARES can also open these
                    backups.
                  </li>
                  <li>
                    <strong>School recovery key configured</strong> — the school keeps its own key
                    for these backups. The technician needs that key.
                  </li>
                  <li>
                    <strong>Recovery needs ARES</strong> — contact ARES. Do not try to recover data
                    without them.
                  </li>
                </ul>
                <h4>For the technician</h4>
                <p>
                  These steps need a login to the server’s command line. The full instructions are
                  in <code>OPS.md</code>, which comes with the program (<code>docs/OPS.md</code> in
                  the source code). Run the commands from the installation folder (
                  <code>/srv/lesson3</code> unless you chose another).
                </p>
                <ul>
                  <li>
                    <strong>Set up backups once:</strong> run{' '}
                    <code>scripts/setup-school-backups.sh</code>. First put ARES’s public recovery
                    key in <code>.env</code> as <code>BACKUP_AGE_RECIPIENT</code>, install the tools
                    listed in <code>OPS.md</code>, and mount the USB drive (setup does not format or
                    mount it). Setup suggests a four-word backup password, or accepts your own of at
                    least 12 characters, and asks you to type it back from paper. It locks the
                    school’s recovery key with that password, installs the nightly schedule, and
                    proves the first backup by restoring it into a test database. Copy the recovery
                    sheet it shows onto paper and keep it away from the server. The password is
                    never saved in a file or log, and it is not anyone’s sign-in password. After a
                    power cut, run the same command and type the same password; it carries on where
                    it stopped. A new school key cannot open older backups; those still need the
                    earlier school key or ARES.
                  </li>
                  <li>
                    <strong>Make a backup now:</strong>{' '}
                    <code>cd /srv/lesson3 &amp;&amp; scripts/backup-db.sh</code>. The schedule runs
                    daily at 02:00, weekly on Sunday at 02:10 and monthly on the 1st at 02:20, by
                    the server’s clock.
                  </li>
                  <li>
                    <strong>List the backups on the USB drive or online copy:</strong>{' '}
                    <code>cd /srv/lesson3 &amp;&amp; scripts/restore-db.sh --list</code>.
                  </li>
                  <li>
                    <strong>Recover with a password-locked key:</strong> you need the backup file,{' '}
                    <code>school-recovery-key.age</code> and the password from the recovery sheet.
                  </li>
                  <li>
                    <strong>Recover with a school-held key:</strong> you need the backup file, the
                    matching private key on the machine where the restore will run (not on the
                    Lesson Plan Editor server), and a temporary copy of the database software
                    running on that machine. <code>OPS.md</code> shows how to start it.
                  </li>
                  <li>
                    <strong>A live restore</strong> replaces all data. It checks the backup in a
                    separate database first, stops the application itself, and keeps the previous
                    database until you discard it, so the restore can be undone until then. Work
                    saved after the restore is lost if you undo it.
                  </li>
                  <li>
                    <strong>Settings:</strong> the agreed limits are{' '}
                    <code>BACKUP_MAX_DATA_LOSS</code> and <code>RECOVERY_TARGET_TIME</code> (for
                    example <code>1d</code>); the USB limit is <code>BACKUP_USB_MAX_AGE</code> (30
                    days unless set). A backup folder that belongs to another installation is
                    refused.
                  </li>
                  <li>
                    If <code>scripts/setup-school-backups.sh</code> is missing, the program is
                    older. Update the whole program; do not copy single scripts into it.
                  </li>
                </ul>
              </GuideAccordionPanel>
            )}
            {can('site-admins.discussions') && (
              <GuideAccordionPanel
                id="site-admins.discussions"
                title="Switch and moderate Discussions"
              >
                <p>
                  Discussions are on by default. In <em>Manage → System → Features</em>, change{' '}
                  <em>Discussions enabled</em> and choose <em>Save</em>. Review the change and enter
                  your password. The switch stays unchanged until Save succeeds. If someone else
                  saved settings first, reload before saving.
                </p>
                <p>
                  On a thread, use <em>Pin</em> or <em>Unpin</em> to change its position.{' '}
                  <em>Delete thread</em> removes the entire thread and every reply, and cannot be
                  undone. <em>Redact</em> on a thread lets you remove the title, opening post, or
                  both; on a reply it removes that reply’s text. Redaction cannot be undone.
                  Existing backups keep the text until they age out. Each action asks for
                  confirmation.
                </p>
                <p>
                  Switching Discussions off hides its pages and entry points from other users;
                  existing discussions are kept. Follow <em>Moderate discussions</em> beside the
                  switch to read, redact or delete while it is off. This view has no search,
                  posting, pinning or unread tracking.
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
                Official version first. It does not control who can open other saved versions.
                Anyone who is signed in can open a saved version if they have its link.
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
        <AppVersion />
      </footer>
    </article>
  )
}
