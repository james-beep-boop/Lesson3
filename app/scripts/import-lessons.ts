/** Production import: docker compose run --rm -v /media/stick/lessons:/import:ro migrate
 * npx payload run scripts/import-lessons.ts -- /import [--yes]
 * Exit codes: 0 done; 2 per-file rejections; 3 set refused; 4 not confirmed; 1 operational error.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { getPayload } from 'payload'
import config from '@payload-config'
import { importLessons } from '../src/ingest/importLessons'

// Payload 3.92 removes "run" and the script path before import (bin/index.js).
// Arguments after its literal -- remain positional, including our --yes.
const args = process.argv.slice(2).filter((a) => a !== '--')
let exitCode = 1
const directory = args.find((a) => !a.startsWith('--'))
if (!directory || args.some((a) => a.startsWith('--') && a !== '--yes')) {
  console.error('Usage: payload run scripts/import-lessons.ts -- DIRECTORY [--yes]')
  exitCode = 1
} else {
  const yes = args.includes('--yes')
  const readline = yes ? null : createInterface({ input: stdin, output: stdout })
  try {
    const payload = await getPayload({ config })
    exitCode = await importLessons(payload, directory, {
      yes,
      print: console.log,
      ask: async (question, defaultYes) => {
        try {
          const answer = (
            await readline!.question(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)
          )
            .trim()
            .toLowerCase()
          return answer === '' ? defaultYes : answer === 'y' || answer === 'yes'
        } catch {
          return false
        } // Closed input is never approval.
      },
    })
    await payload.destroy()
  } finally {
    readline?.close()
  }
}

// Payload's bin unconditionally exits 0 after a successful import; exitCode alone is discarded.
process.exit(exitCode)
