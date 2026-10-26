/** docker compose run --rm migrate npx payload run scripts/set-school-name.ts -- "Kisumu Boys High School"
 * Pass "" to clear the label. This is a trusted operator command, not a public endpoint.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { parseSchoolName } from '../src/lib/schoolName'
import { setSchoolName } from '../src/lib/setSchoolName'

// Payload 3.92 removes `run` and the script name before importing (bin/index.js).
const args = process.argv.slice(2).filter((arg) => arg !== '--')
let exitCode = 1
if (args.length !== 1) {
  console.error('Usage: payload run scripts/set-school-name.ts -- "School name" ("" clears it)')
} else {
  let payload: Awaited<ReturnType<typeof getPayload>> | undefined
  try {
    const name = parseSchoolName(args[0])
    payload = await getPayload({ config })
    await setSchoolName(payload, name)
    console.log(name ? `School name set to: ${name}` : 'School name cleared.')
    exitCode = 0
  } catch (e) {
    console.error((e as Error).message)
  } finally {
    await payload?.destroy()
  }
}
// Payload's run command otherwise exits zero after successfully importing the script.
process.exit(exitCode)
