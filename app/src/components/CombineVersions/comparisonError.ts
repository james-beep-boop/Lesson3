/** How a failed combine-preview request is told apart and worded — shared by the Combine screen and
 * the editor's restore/retry paths, so the wording cannot drift between them. */
export const COMPARISON_FAILED = 'Could not load the comparison. Try again.'
export const DRAFT_COMPARISON_FAILED =
  'Could not load the comparison. Your draft text is on screen. Retry the comparison before saving this combination.'
export const PARENT_GONE =
  'The other version is no longer available. Your saved text has been restored as an ordinary draft.'

/**
 * A combine-preview refusal. `gone` means the preview REFUSED this pair (400 different plan or same
 * version, 403 no editing access, 404 unreadable) — a stored second parent that will not come back,
 * so the draft continues as an ordinary one. Anything else (429, 5xx, a timeout) may clear: retry.
 */
export class ComparisonError extends Error {
  readonly gone: boolean
  constructor(status: number | null) {
    super(COMPARISON_FAILED)
    this.name = 'ComparisonError'
    this.gone = status === 400 || status === 403 || status === 404
  }
}
