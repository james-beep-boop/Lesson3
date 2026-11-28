import { notFound } from 'next/navigation'

import { adminScopeIds, canImportDecks, isSiteAdmin } from '@/access'
import PageBackLink from '@/components/PageBackLink'
import PageHeader from '@/components/PageHeader'
import { requireUser } from '@/lib/session'

import { DeckUploadForm } from './DeckUploadForm'

export default async function DeckImportPage() {
  const { payload, user } = await requireUser()
  if (!canImportDecks(user)) notFound()

  const { docs } = await payload.find({
    collection: 'lesson-plans',
    where: {
      officialVersion: { exists: true },
      ...(isSiteAdmin(user) ? {} : { subjectGrade: { in: adminScopeIds(user) } }),
    },
    depth: 1,
    select: { title: true, subjectGrade: true },
    populate: { 'subject-grades': { displayName: true } },
    pagination: false,
    sort: 'title',
    overrideAccess: false,
    user,
  })

  return (
    <article className="guide">
      <PageHeader
        title="Upload lesson decks"
        actions={<PageBackLink href="/admin" label="Back to Manage" />}
      />
      {docs.length ? (
        <DeckUploadForm
          plans={docs.map(({ id, title, subjectGrade }) => ({
            id,
            label:
              typeof subjectGrade === 'object' && subjectGrade.displayName
                ? `${subjectGrade.displayName} · ${title}`
                : title,
          }))}
        />
      ) : (
        <p>Upload a lesson plan for the sub-strand before uploading its decks.</p>
      )}
    </article>
  )
}
