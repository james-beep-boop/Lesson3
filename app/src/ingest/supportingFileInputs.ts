import { createHash } from 'node:crypto'
import JSZip from 'jszip'

import { IngestError } from './errors'
import { parseSupportingFileName, type SupportingFileName } from './supportingFileNames'
import {
  MAX_BODY_BYTES,
  MAX_EXPANDED_BYTES,
  readZipEntry,
  zipDirectoryEntries,
} from './uploadFiles'

// A full set of per-lesson Quick Checks and Answer Keys can have both a Word and a PDF copy.
export const MAX_SUPPORTING_FILES = 2_000
export const supportingFilesTooLarge = 'The files take up more than 200 MB. Upload them in parts.'

type Input = { name: string; size: number; read: () => Promise<Buffer> }

export type SupportingFileInput =
  | { file: string; reason: string }
  | { file: string; name: SupportingFileName; bytes: Buffer; hash: string }

export async function prepareSupportingFileInputs(files: Input[]): Promise<SupportingFileInput[]> {
  if (files.length > MAX_SUPPORTING_FILES)
    throw new IngestError(`Choose up to ${MAX_SUPPORTING_FILES} files at a time.`)
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BODY_BYTES)
    throw new IngestError(supportingFilesTooLarge)

  const inputs: SupportingFileInput[] = []
  let expandedBytes = 0
  const countBytes = (bytes: number) => {
    expandedBytes += bytes
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new IngestError(supportingFilesTooLarge)
  }
  const addFile = async (file: string, read: Input['read']) => {
    if (inputs.length >= MAX_SUPPORTING_FILES)
      throw new IngestError(`Choose up to ${MAX_SUPPORTING_FILES} files at a time.`)
    const name = parseSupportingFileName(file)
    if (!name) {
      inputs.push({ file, reason: 'The file name or type does not match a supported format.' })
      return
    }
    const bytes = await read()
    inputs.push(
      bytes.length
        ? { file, name, bytes, hash: createHash('sha256').update(bytes).digest('hex') }
        : { file, reason: 'The file is empty.' },
    )
  }

  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      await addFile(file.name, async () => {
        const bytes = await file.read()
        countBytes(bytes.length)
        return bytes
      })
      continue
    }
    const bytes = await file.read()
    const count = zipDirectoryEntries(bytes, MAX_SUPPORTING_FILES)
    if (count === null) throw new IngestError(`Cannot read ZIP file ${file.name}.`)
    if (count > MAX_SUPPORTING_FILES)
      throw new IngestError(`A ZIP can contain up to ${MAX_SUPPORTING_FILES} entries.`)
    const zip = await JSZip.loadAsync(bytes).catch(() => {
      throw new IngestError(`Cannot read ZIP file ${file.name}.`)
    })
    const entries = Object.values(zip.files)
    if (entries.length !== count)
      throw new IngestError(`ZIP file ${file.name} has duplicate paths or a damaged directory.`)
    for (const entry of entries) {
      if (entry.dir) continue
      const path = `${file.name}/${entry.unsafeOriginalName ?? entry.name}`
      await addFile(path, async () => {
        try {
          return await readZipEntry(entry, (_size, chunkBytes) => countBytes(chunkBytes))
        } catch (error) {
          if (error instanceof IngestError) throw error
          throw new IngestError(`Cannot read ${path} from the ZIP file.`)
        }
      })
    }
  }
  if (inputs.length === 0) throw new IngestError('Choose a ZIP file or a folder with files in it.')
  return inputs
}
