import JSZip from 'jszip'
import { expect, it } from 'vitest'

import { generateFromVersionSnapshot } from '../../src/generator/generateForVersion'
import { plan } from '../fixtures/companion-documents/plan'

it('matches the saved DOCX layouts for both companion documents', async () => {
  const documents = await generateFromVersionSnapshot(plan)
  for (const tag of ['compactTeacherGuide', 'studentSummaryTable'] as const) {
    const zip = await JSZip.loadAsync(documents[tag])
    for (const part of ['document', 'footer1']) {
      const xml = await zip.file(`word/${part}.xml`)!.async('string')
      // Compare the layout XML without ZIP timestamps or document metadata.
      const lines = xml.replace(/(<\/w:(?:p|tc|tr|tbl|sectPr|body|document|ftr)>)/g, '$1\n')
      const golden = part === 'document' ? `${tag}.document.xml` : 'footer.xml'
      await expect(lines).toMatchFileSnapshot(`../fixtures/companion-documents/${golden}`)
    }
  }
})
