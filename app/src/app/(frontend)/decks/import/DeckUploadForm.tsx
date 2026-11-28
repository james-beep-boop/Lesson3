'use client'

import { useState, type FormEvent } from 'react'

type Result = {
  id: number
  lessonNumber: number
  status: 'imported' | 'already here' | 'replaced'
  semver?: string
}

export function DeckUploadForm({ plans }: { plans: { id: number; label: string }[] }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<Result[]>([])

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResults([])
    try {
      const response = await fetch('/api/decks/upload', {
        method: 'POST',
        body: new FormData(event.currentTarget),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.errors?.[0]?.message || 'The upload failed.')
      setResults(result.decks)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="login-form" onSubmit={upload}>
        <label>
          Sub-strand
          <select name="lessonPlan" required defaultValue="">
            <option value="" disabled>
              Choose a sub-strand
            </option>
            {plans.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Deck file
          <input type="file" name="file" accept=".json,.zip" required />
        </label>
        <p>
          Choose one deck spec or a ZIP for one sub-strand. Name the specs in the ZIP like
          L1.spec.json. You can include the pictures in the ZIP.
        </p>
        <label>
          Lesson number
          <input name="lessonNumber" type="number" min={1} step={1} />
        </label>
        <p>Fill this in if your single JSON file does not give the lesson number in its name.</p>
        <p>
          <strong>
            A changed spec replaces the deck and deletes all its saved versions. The new deck
            starts at version 1.0.0.
          </strong>
        </p>
        <input name="replace" type="hidden" value="yes" />
        <button type="submit" className="btn btn--primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Uploading…' : 'Upload decks'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {results.length > 0 && (
        <ul aria-live="polite">
          {results.map(({ id, lessonNumber, status, semver }) => (
            <li key={id}>
              Lesson {lessonNumber}{' '}
              {status === 'already here' ? 'is already here' : `was ${status} at version ${semver}`}.
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
