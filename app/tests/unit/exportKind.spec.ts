/**
 * Pins the job-boundary export-kind guard (Codex 2026-07-08 P3): payload-jobs `inputSchema`
 * types `kind` as bare `text`, so the task handlers must reject anything but docx|pdf before
 * writing artifacts — a bad value would land under an arbitrary cache namespace while being
 * treated as DOCX-like. Fast unit pin per the working agreement on security-critical invariants.
 */
import { describe, expect, it } from 'vitest'

import { assertExportKind } from '../../src/generator/exportArtifacts.js'

describe('assertExportKind (job-boundary guard)', () => {
  it('accepts the two real kinds', () => {
    expect(() => assertExportKind('docx')).not.toThrow()
    expect(() => assertExportKind('pdf')).not.toThrow()
  })

  it.each(['PDF', 'Docx', 'zip', 'anything', '', null, undefined, 7])(
    'rejects %j',
    (bad) => {
      expect(() => assertExportKind(bad)).toThrow(/Invalid export kind/)
    },
  )
})
