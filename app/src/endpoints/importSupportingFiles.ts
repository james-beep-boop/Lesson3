import { APIError, type Endpoint } from 'payload'

import { IngestError } from '../ingest/errors'
import { importSupportingFiles } from '../ingest/importSupportingFiles'
import {
  prepareSupportingFileInputs,
  supportingFilesTooLarge,
} from '../ingest/supportingFileInputs'
import { MAX_BODY_BYTES } from '../ingest/uploadFiles'
import { assertDeclaredBodyWithin, assertSiteAdmin } from './respond'

export const importSupportingFilesEndpoint: Endpoint = {
  path: '/import',
  method: 'post',
  handler: async (req) => {
    assertSiteAdmin(req)
    assertDeclaredBodyWithin(req, MAX_BODY_BYTES, supportingFilesTooLarge)

    let form: FormData
    try {
      form = await req.formData!()
    } catch {
      throw new APIError('Choose a ZIP file or a folder of supporting files.', 400)
    }
    const confirmation = form.get('confirm')
    if (
      confirmation !== null &&
      (typeof confirmation !== 'string' || !/^[a-f0-9]{64}$/.test(confirmation))
    )
      throw new APIError('Check the files before importing them.', 400)
    const files = form.getAll('files').filter((field): field is File => typeof field !== 'string')
    try {
      const inputs = await prepareSupportingFileInputs(
        files.map((file) => ({
          name: file.name,
          size: file.size,
          read: async () => Buffer.from(await file.arrayBuffer()),
        })),
      )
      const report = await importSupportingFiles(req.payload, inputs, confirmation ?? undefined)
      return Response.json(report, {
        status: confirmation && confirmation !== report.previewToken ? 409 : 200,
      })
    } catch (error) {
      if (error instanceof IngestError) throw new APIError(error.message, 400)
      throw error
    }
  },
}
