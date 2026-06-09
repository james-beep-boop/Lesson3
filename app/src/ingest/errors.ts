/**
 * Error raised when an ARES `.js` data module cannot be safely ingested — either it
 * fails the static-extraction contract (non-literal syntax, see `extract.ts`), is
 * structurally wrong, fails the generator-completeness gate, or its taxonomy is
 * unresolved. Carries an optional source location for extraction failures.
 */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly detail?: { node?: string; line?: number; column?: number },
  ) {
    super(message)
    this.name = 'IngestError'
  }
}
