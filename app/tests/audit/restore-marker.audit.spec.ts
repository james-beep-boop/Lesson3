import { it, expect } from 'vitest'
import { renderOf } from '../../src/components/EditRecovery/restoreDiff'
it('audit: literal annotation-marker text must not hide an invisible paragraph change', () => {
  expect(renderOf('data-match-type', 'data-match-type\n', false)).toEqual({ kind: 'paragraphs' })
})
