'use client'

/**
 * UploadBundles — Site-Admin-only panel above the Lesson Plans list (SPEC §7 deviation;
 * see docs/DECISIONS.md). Injected via admin.components.beforeListTable.
 *
 * Renders NOTHING unless the current user is a Site Administrator (`roles` includes
 * 'siteAdmin' — saveToJWT, so it's on the client user). This hides the control as requested;
 * the real authorization boundary is the server endpoint (POST /api/lesson-plans/upload),
 * which re-checks isSiteAdmin. Accepts ARES `.json` exports and ZIP archives and creates Official 1.0.0
 * lesson-plan versions.
 *
 * Missing subjects/grades (SPEC §7, amended 2026-10-21): the server answers 409 with the `missing`
 * list and writes nothing. The panel asks once, then resubmits the SAME files with `createTaxonomy`.
 * A subject whose name resembles another (`similarTo`) must be answered "new subject" or
 * "misspelling" before anything is sent; a misspelling is never created and its files are rejected.
 */
import React, { useRef, useState } from 'react'
import { Button, toast, useAuth, useConfig } from '@payloadcms/ui'
import type { OfficialPreview } from '../../ingest/releaseDecision'
import OfficialPreviewList from './OfficialPreviewList'
import { useRouter } from 'next/navigation'

type UploadResult = {
  file: string
  id: number | string
  title: string
  semver: string
  official: boolean
  action: 'created' | 'revised'
  warnings: string[]
  reason?: string
}

type FileIssue = { file: string; error: string }
type TaxonomyKey = { subject: string; grade: number }
type MissingItem = TaxonomyKey & { newSubject: boolean; similarTo: string[]; files: string[] }
type UploadReport = {
  ok: boolean
  count: number
  bundles: UploadResult[]
  created?: (TaxonomyKey & { newSubject: boolean })[]
  needsConfirmation?: boolean
  missing?: MissingItem[]
  rejected?: FileIssue[]
  skipped?: FileIssue[]
  error?: string
  errors?: { message?: string }[]
  official?: OfficialPreview[]
  previewToken?: string
  confirmationChanged?: boolean
  setRefused?: FileIssue[]
  waitingForProgram?: FileIssue[]
  warnings?: FileIssue[]
  messageWarnings?: string[]
}

const keyOf = (t: TaxonomyKey) => `${t.subject}::${t.grade}`
const filesLabel = (n: number) => `${n} file${n === 1 ? '' : 's'}`

/** Missing items grouped by subject, in the order the server listed them. */
function groupBySubject(missing: MissingItem[]) {
  const groups = new Map<string, MissingItem[]>()
  for (const m of missing) groups.set(m.subject, [...(groups.get(m.subject) ?? []), m])
  return [...groups.entries()].map(([subject, items]) => ({
    subject,
    newSubject: items[0]!.newSubject,
    similarTo: items[0]!.similarTo,
    items,
  }))
}

export default function UploadBundles() {
  const { user } = useAuth()
  const { config } = useConfig()
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])
  const [report, setReport] = useState<UploadReport | null>(null)
  /** The confirmation round: what to ask, the grade ticks, and each similar subject's answer. */
  const [missing, setMissing] = useState<MissingItem[] | null>(null)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [answers, setAnswers] = useState<Record<string, 'new' | 'misspelling'>>({})
  const clearReport = () => {
    setResults([])
    setReport(null)
    setMissing(null)
  }
  const inputRef = useRef<HTMLInputElement>(null)

  // Site Admin only — invisible to everyone else (server still enforces independently).
  const roles = (user as { roles?: string[] } | null | undefined)?.roles
  if (!roles?.includes('siteAdmin')) return null

  const apiBase = `${config.serverURL || ''}${config.routes?.api || '/api'}`

  /** `approvals` undefined = first round; an array = the Site Administrator's answer. */
  const onUpload = async (approvals?: TaxonomyKey[], token?: string) => {
    if (files.length === 0) {
      toast.error('Choose .json files or a .zip archive first')
      return
    }
    const form = new FormData()
    for (const f of files) form.append('files', f)
    if (token) form.append('confirmOfficial', token)
    if (approvals) form.append('createTaxonomy', JSON.stringify(approvals))

    setBusy(true)
    clearReport()
    try {
      const res = await fetch(`${apiBase}/lesson-plans/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      const json = (await res.json()) as UploadReport
      // Missing subjects/grades: nothing was written. Keep the files and ask.
      if (res.status === 409 && json.needsConfirmation && Array.isArray(json.missing)) {
        setReport(json)
        setMissing(json.missing)
        // Plainly new items start ticked; a similar-named subject starts unticked until answered.
        setTicked(Object.fromEntries(json.missing.map((m) => [keyOf(m), m.similarTo.length === 0])))
        setAnswers({})
        return
      }
      // A completed report can have no successes (422), or both imports and rejections (200).
      if (
        !Array.isArray(json.bundles) ||
        !Array.isArray(json.rejected) ||
        (res.status !== 200 && res.status !== 422)
      ) {
        toast.error(json.error || json.errors?.[0]?.message || `Upload failed (${res.status})`)
        return
      }
      setReport(json)
      setResults(json.bundles)
      const rejected = json.rejected?.length ?? 0
      const skipped = json.skipped?.length ?? 0
      const createdCount = json.created?.length ?? 0
      const message =
        `Imported ${json.count} file(s); rejected ${rejected}; skipped ${skipped}.` +
        (createdCount > 0 ? ` Created ${createdCount} subject grade(s).` : '')
      if (json.ok) toast.success(message)
      else toast.error(message)
      // Reset the picker so the button returns to its disabled "Upload" state and the same
      // files can't be re-submitted by accident. (Clearing state alone won't clear the native
      // input's "N files" label — reset its value too.)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      if (json.count > 0) router.refresh() // reflect the new lesson plans in the list
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const groups = missing ? groupBySubject(missing) : []
  const unanswered = groups.some((g) => g.similarTo.length > 0 && !answers[g.subject])
  const approvals = (missing ?? []).filter(
    (m) => ticked[keyOf(m)] && (m.similarTo.length === 0 || answers[m.subject] === 'new'),
  )
  const answer = (subject: string, value: 'new' | 'misspelling', items: MissingItem[]) => {
    setAnswers((a) => ({ ...a, [subject]: value }))
    setTicked((t) => ({
      ...t,
      ...Object.fromEntries(items.map((m) => [keyOf(m), value === 'new'])),
    }))
  }
  const cancelConfirmation = () => {
    clearReport()
    setFiles([])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 4,
        padding: '1rem',
        marginBottom: '1rem',
        background: 'var(--theme-elevation-50)',
      }}
    >
      {/* Heading lives on Manage ("Upload lesson plans"); not repeated here. `lp-manage__desc` is the
          shared help-text class the sibling panels use — the inline style it replaces had drifted to
          0.85rem (13.6px) against the 14px token and had no max-width measure. */}
      <p className="lp-manage__desc">Site administrator only.</p>
      <p className="lp-manage__desc">
        If a file names a subject or grade that does not exist yet, you will be asked whether to
        create it before anything is imported. The subject name and grade come from the lesson file.
      </p>
      <p className="lp-manage__desc">
        Choose ARES <code>.json</code> exports or <code>.zip</code> archives containing JSON files,
        including files in folders. Valid files are imported even if others fail. Unchanged files
        are skipped, so you can re-upload a corrected ZIP. New plans become Official 1.0.0; new
        releases replace an ARES Official after confirmation. A teacher’s Official stays unchanged,
        waiting for the subject-grade administrator. Up to 500 JSON files and 200 MB of JSON in
        total, 5 MB per JSON file and 50 MB per ZIP. Review the report below after uploading.
      </p>
      {/* Classed, not inline-styled: the class is what lets the shared admin button block reach
          Upload. It was the last control on Manage rendering as stock Payload (operator report,
          2026-08-02) — measured 29.08px against the system's 38px. */}
      <div className="lp-manage__upload">
        <input
          ref={inputRef}
          type="file"
          className="lp-manage__file"
          accept=".json,.zip,application/json,application/zip,application/x-zip-compressed"
          multiple
          disabled={busy}
          // The PREVIOUS upload's result list is cleared the moment the picker is opened, not when
          // new files arrive (operator report 2026-08-02): the old filenames stayed on screen after
          // a successful upload, so the panel read as though those files were queued again. `onClick`
          // fires when the OS dialog opens, so the stale list goes even if the admin then cancels —
          // which is the case `onChange` alone would miss. `onChange` clears too, for the paths that
          // set files without a click (drag-drop, programmatic).
          onClick={clearReport}
          onChange={(e) => {
            clearReport()
            setFiles(e.target.files ? Array.from(e.target.files) : [])
          }}
        />
        <Button
          className="lp-btn"
          buttonStyle="secondary"
          size="small"
          onClick={() => onUpload()}
          disabled={busy || files.length === 0 || missing != null}
        >
          {busy ? 'Uploading…' : `Upload${files.length ? ` ${files.length} file(s)` : ''}`}
        </Button>
      </div>
      {missing && (
        <fieldset className="lp-upload-confirm" disabled={busy}>
          <legend>
            {groups.length === 0
              ? 'Confirm Official updates'
              : report?.official?.some((p) => p.willMove)
                ? 'Confirm lesson updates and new subjects or grades'
                : 'Create missing subjects and grades?'}
          </legend>
          {report?.confirmationChanged && (
            <p role="alert">Something changed since you looked. Please check the list again.</p>
          )}
          {report?.official && <OfficialPreviewList preview={report.official} />}
          <p className="lp-manage__desc">
            Nothing has been imported yet.{' '}
            {report?.official?.length ? 'Existing versions stay in the version history. ' : ''}
            {groups.length
              ? 'Tick what to create; files for anything left unticked are rejected. A new grade has no Subject Administrator until you assign one.'
              : 'Confirm to apply these Official updates.'}
          </p>
          {groups.map((g) => (
            <div key={g.subject} className="lp-upload-confirm__subject">
              <p>
                <strong>{g.subject}</strong>
                {g.newSubject ? ' (new subject)' : ' (existing subject, new grade)'}
              </p>
              {g.similarTo.length > 0 && (
                <div role="radiogroup" aria-label={`Is ${g.subject} a new subject?`}>
                  <p>
                    Is “{g.subject}” a new subject, or a misspelling of “{g.similarTo.join('”, “')}
                    ”?
                  </p>
                  <label>
                    <input
                      type="radio"
                      name={`answer-${g.subject}`}
                      checked={answers[g.subject] === 'new'}
                      onChange={() => answer(g.subject, 'new', g.items)}
                    />{' '}
                    A new subject
                  </label>{' '}
                  <label>
                    <input
                      type="radio"
                      name={`answer-${g.subject}`}
                      checked={answers[g.subject] === 'misspelling'}
                      onChange={() => answer(g.subject, 'misspelling', g.items)}
                    />{' '}
                    A misspelling — reject its files so I can correct them
                  </label>
                </div>
              )}
              <ul className="lp-manage__list">
                {g.items.map((m) => (
                  <li key={keyOf(m)}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!ticked[keyOf(m)]}
                        disabled={g.similarTo.length > 0 && answers[g.subject] !== 'new'}
                        onChange={(e) => setTicked((t) => ({ ...t, [keyOf(m)]: e.target.checked }))}
                      />{' '}
                      Create {m.subject} — Grade {m.grade} ({filesLabel(m.files.length)})
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="lp-manage__upload">
            <Button
              className="lp-btn"
              buttonStyle="primary"
              size="small"
              onClick={() =>
                onUpload(
                  approvals.map(({ subject, grade }) => ({ subject, grade })),
                  report?.previewToken,
                )
              }
              disabled={busy || unanswered}
            >
              {busy
                ? 'Uploading…'
                : groups.length
                  ? `Create ${approvals.length} and import`
                  : 'Confirm'}
            </Button>
            <Button
              className="lp-btn"
              buttonStyle="secondary"
              size="small"
              onClick={cancelConfirmation}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
          {unanswered && (
            <p className="lp-manage__desc">
              Answer each “new subject or misspelling?” question first.
            </p>
          )}
        </fieldset>
      )}
      {report && !missing && (
        <div role="status" style={{ marginTop: '0.75rem' }}>
          Imported {report.count} file(s); rejected {report.rejected?.length ?? 0}; skipped{' '}
          {report.skipped?.length ?? 0}.
        </div>
      )}
      {(report?.created?.length ?? 0) > 0 && (
        <div>
          <p id="lp-upload-created">Created subjects and grades</p>
          <ul aria-labelledby="lp-upload-created">
            {report?.created?.map((c) => (
              <li key={keyOf(c)}>
                {c.subject} — Grade {c.grade}
                {c.newSubject ? ' (new subject)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report?.messageWarnings?.map((warning, i) => (
        <p role="alert" key={i}>
          {warning}
        </p>
      ))}
      {(['setRefused', 'waitingForProgram', 'warnings'] as const).map(
        (kind) =>
          (report?.[kind]?.length ?? 0) > 0 && (
            <div key={kind}>
              <p>
                {kind === 'setRefused'
                  ? 'Lesson sets refused'
                  : kind === 'waitingForProgram'
                    ? 'Waiting for a program update'
                    : 'Warnings'}
              </p>
              <ul>
                {report?.[kind]?.map((r, i) => (
                  <li key={i}>
                    {r.file}: {r.error}
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
      {results.length > 0 && (
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
          {results.map((r, i) => (
            <li key={`${r.id}-${i}`}>
              {r.file} · {r.action === 'revised' ? 'Revised' : 'New'} · #{r.id} · {r.title} (
              {r.semver}, {r.official ? 'Official' : 'Not Official'})
              {!r.official && r.reason && <span> · {r.reason}</span>}
              {r.warnings.length > 0 && (
                <span style={{ color: 'var(--theme-warning-600, #a60)' }}>
                  {' '}
                  · Warning: {r.warnings.length} deliverable warning(s)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(report?.rejected?.length ?? 0) > 0 && (
        <div>
          <p>Rejected files</p>
          <ul>
            {report?.rejected?.map((r, i) => (
              <li key={i}>
                <strong>{r.file}</strong>: <span style={{ whiteSpace: 'pre-wrap' }}>{r.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(report?.skipped?.length ?? 0) > 0 && (
        <div>
          <p>Skipped files</p>
          <ul>
            {report?.skipped?.map((r, i) => (
              <li key={i}>
                {r.file}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
