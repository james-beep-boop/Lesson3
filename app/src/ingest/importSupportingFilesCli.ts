import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { getPayload } from 'payload'
import config from '@payload-config'

import { importSupportingFiles } from './importSupportingFiles'
import { prepareSupportingFileInputs } from './supportingFileInputs'

async function folderFiles(root: string, folder = ''): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) files.push(...(await folderFiles(root, path)))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function run() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: { confirm: { type: 'string' } },
  })
  const [source] = positionals
  if (
    positionals.length !== 1 ||
    (values.confirm !== undefined && !/^[a-f0-9]{64}$/.test(values.confirm))
  ) {
    throw new Error(
      'Usage: npx payload run src/ingest/importSupportingFilesCli.ts -- <zip-or-folder> [--confirm <preview-token>]',
    )
  }

  const path = resolve(source)
  const directory = (await stat(path)).isDirectory()
  if (!directory && !path.toLowerCase().endsWith('.zip')) {
    throw new Error('Choose a ZIP file or folder.')
  }
  const paths = directory ? (await folderFiles(path)).sort() : [basename(path)]
  const inputs = await prepareSupportingFileInputs(
    await Promise.all(
      paths.map(async (name) => {
        const file = directory ? join(path, name) : path
        return { name, size: (await stat(file)).size, read: () => readFile(file) }
      }),
    ),
  )

  const payload = await getPayload({ config })
  const report = await importSupportingFiles(payload, inputs, values.confirm)
  for (const row of report.rows) {
    const file = JSON.stringify(row.file)
    if (row.status === 'unmatched') {
      console.log(`Unmatched | ${file} | ${row.reason}`)
      continue
    }
    const { title, lessonPlan, lessonNumber } = row.attachment
    const matchLabel = report.imported ? 'Imported' : 'Matched'
    const label = row.status === 'alreadyHere' ? 'Already here' : matchLabel
    const lesson = lessonNumber === null ? 'whole sub-strand' : `lesson ${lessonNumber}`
    const target = `${JSON.stringify(title)} (plan ${lessonPlan}, ${lesson})`
    console.log([label, file, target, row.reason].filter(Boolean).join(' | '))
  }
  if (report.imported) console.log(`Imported ${report.imported} files.`)
  if (report.rows.some((row) => row.status === 'matched') && !report.imported)
    console.log(`To save the matches, run the same command with --confirm ${report.previewToken}`)
  if (values.confirm && values.confirm !== report.previewToken)
    throw new Error('The report changed. Check the new report before confirming again.')
}

// payload run waits for module evaluation. Keep the import and report inside the top-level await.
await run().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
process.exit(0)
