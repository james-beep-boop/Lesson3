// Real-stack PTY coverage. Secrets stay in this process's memory; stdout contains assertion names only.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  unlinkSync,
  renameSync,
} from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

const root = process.env.PROBE_ROOT
assert(root)
const usb = join(root, 'usb')
const disk = join(root, 'disk-backups')
const state = join(root, 'out/ops/.school-backup-setup')
const key = join(disk, 'school-recovery-key.age')
const setup = join(root, 'scripts/setup-school-backups.sh')
const restore = join(root, 'scripts/restore-db.sh')
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`
const sql = (query) =>
  execFileSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'lesson3', '-d', 'postgres', '-tAc', query],
    { cwd: root, encoding: 'utf8' },
  ).trim()
const livePlans = () =>
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'lesson3',
      '-d',
      'lesson3',
      '-tAc',
      "SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id)::text, '[]') FROM lesson_plans p;",
    ],
    { cwd: root, encoding: 'utf8' },
  ).trim()
const originalPlans = livePlans()
let password = ''
const secrets = new Set()
let lastOutput = ''
let checks = 0
const check = (name, assertion) => {
  assertion()
  checks++
  console.log(`ok   school setup: ${name}`)
}
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

function terminal(
  args,
  { mode = 'resume', stop = '', identity, workdir = root, usbChoice = 'y', extraEnv = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'script',
      ['-q', '-e', '--echo', 'never', '-c', args.map(quote).join(' '), '/dev/null'],
      {
        cwd: workdir,
        env: {
          ...process.env,
          ...extraEnv,
          BACKUP_SETUP_STOP_AFTER: stop,
          ...(identity ? { AGE_IDENTITY: identity } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    let output = ''
    let consumed = 0
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('PTY operation exceeded its deadline'))
    }, 240_000)
    const receive = (chunk) => {
      output += chunk.toString('utf8')
      const tail = output.slice(consumed).replaceAll('\r', '')
      const suggestion = /RECOVERY SHEET — suggested backup password: ([a-z-]+)/.exec(tail)
      if (suggestion) {
        secrets.add(suggestion[1])
        if (mode === 'suggestion') password = suggestion[1]
      }
      let response
      if (/Is a USB backup drive connected\? \[y\/N\]: $/.test(tail)) response = usbChoice
      else if (/Absolute backup folder on the mounted USB drive: $/.test(tail)) response = usb
      else if (/Use the suggested password\? \[Y\/n\]: $/.test(tail))
        response = mode === 'suggestion' ? 'y' : 'n'
      else if (/Choose a backup password \(at least 12 characters\): $/.test(tail))
        response = password
      else if (/Type your chosen password again: $/.test(tail))
        response = mode === 'mismatch' ? 'different' : password
      else if (/Type the written backup password back to confirm it: $/.test(tail))
        response = mode === 'bad-back' ? 'not-what-was-written' : password
      else if (/Backup password to resume setup: $/.test(tail))
        response = mode === 'wrong-resume' ? 'wrong-backup-password' : password
      else if (/Enter passphrase[^\n]*: $/.test(tail))
        response = mode === 'wrong' ? 'wrong-backup-password' : password
      if (response !== undefined) {
        consumed = output.length
        child.stdin.write(`${response}\n`)
      }
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', receive)
    child.stderr.on('data', receive)
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      lastOutput = output
      resolve({ code, output })
    })
  })
}
const noLeaks = () => {
  const visit = (path) => {
    if (!existsSync(path)) return
    const metadata = statSync(path)
    if (metadata.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name))
    else if (metadata.isFile()) {
      const bytes = readFileSync(path)
      for (const secret of secrets)
        assert(!bytes.includes(Buffer.from(secret)), `secret written to ${path}`)
      assert(
        !bytes.includes(Buffer.from('AGE-SECRET-KEY-')),
        `unlocked identity written to ${path}`,
      )
    }
  }
  for (const path of [disk, usb, join(root, 'out'), join(root, '.env'), join(root, 'cron')])
    visit(path)
}

try {
  const words = new Set(
    readFileSync(join(root, 'scripts/vendor/eff_large_wordlist.txt'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split('\t')[1]),
  )
  check('the credited EFF list has all 7,776 words', () => assert.equal(words.size, 7776))
  const earlierRecipient = execFileSync(
    'bash',
    ['-o', 'pipefail', '-c', 'age-keygen | age-keygen -y'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim()
  writeFileSync(
    join(root, '.env'),
    readFileSync(join(root, '.env'), 'utf8') + `BACKUP_AGE_RECIPIENT_SCHOOL=${earlierRecipient}\n`,
  )
  writeFileSync(join(usb, '.lesson3-installation'), '22222222-2222-2222-2222-222222222222\n')
  writeFileSync(join(usb, 'older-backup.dump.age'), 'fixture backup to preserve')
  let result = await terminal(['bash', setup], { mode: 'suggestion' })
  check('foreign USB is refused before key creation', () => {
    assert.notEqual(result.code, 0)
    assert(!existsSync(key))
    assert.equal(
      readFileSync(join(usb, 'older-backup.dump.age'), 'utf8'),
      'fixture backup to preserve',
    )
  })
  unlinkSync(join(usb, '.lesson3-installation'))

  password = 'short'
  secrets.add(password)
  result = await terminal(['bash', setup], { mode: 'short' })
  check('a custom password shorter than twelve characters is refused', () => {
    assert.notEqual(result.code, 0)
    assert(!existsSync(key))
  })
  password = randomBytes(16).toString('hex')
  secrets.add(password)
  result = await terminal(['bash', setup], { mode: 'mismatch' })
  check('different custom password confirmations are refused', () => {
    assert.notEqual(result.code, 0)
    assert(!existsSync(key))
  })
  result = await terminal(['bash', setup], { mode: 'bad-back' })
  check('the written-password check precedes creation of any identity', () => {
    assert.notEqual(result.code, 0)
    assert(!existsSync(key))
    assert(!existsSync(join(disk, '.school-recovery-key.age.pending')))
  })

  let lockedHash
  let recipient
  for (const step of [
    'destinations',
    'key-staged',
    'key',
    'recipient',
    'schedule',
    'backup',
    'drill',
    'completed',
  ]) {
    // destinations was completed while testing refused passwords; remove only that checkpoint to
    // exercise a kill at that boundary as well. No identity or recipient has been created yet.
    if (step === 'destinations') unlinkSync(join(state, 'destinations'))
    result = await terminal(['bash', setup], {
      mode: step === 'key-staged' ? 'suggestion' : 'resume',
      stop: step,
    })
    check(`a power cut after ${step} leaves a durable checkpoint`, () => {
      assert.notEqual(result.code, 0)
      assert(
        existsSync(
          step === 'key-staged' ? join(disk, '.school-recovery-key.age.staged') : join(state, step),
        ),
      )
    })
    if (step === 'key-staged') lockedHash = hash(join(disk, '.school-recovery-key.age.staged'))
    if (existsSync(key)) {
      lockedHash ??= hash(key)
      check(`resume after ${step} keeps the same encrypted key`, () =>
        assert.equal(hash(key), lockedHash),
      )
      check(`the USB key after ${step} is the same ciphertext`, () =>
        assert.equal(hash(join(usb, 'school-recovery-key.age')), lockedHash),
      )
    }
    const configured = /^BACKUP_AGE_RECIPIENT_SCHOOL=(.+)$/m.exec(
      readFileSync(join(root, '.env'), 'utf8'),
    )?.[1]
    if (configured && configured !== earlierRecipient) {
      recipient ??= configured
      check(`resume after ${step} keeps the same public recipient`, () =>
        assert.equal(configured, recipient),
      )
    }
    check(`no password or plaintext identity persisted after ${step}`, noLeaks)
  }
  check(
    'a new school key is allowed and the earlier public recipient is retained in setup history',
    () => {
      assert.notEqual(recipient, earlierRecipient)
      assert.equal(readFileSync(join(state, 'previous-recipient'), 'utf8').trim(), earlierRecipient)
    },
  )
  check('the suggestion is four entries from the EFF list', () => {
    // Four EFF entries themselves contain a hyphen (for example t-shirt); a plain split is wrong.
    const fourWords = (phrase, count) =>
      count === 1
        ? words.has(phrase)
        : [...phrase.matchAll(/-/g)].some(
            (m) =>
              words.has(phrase.slice(0, m.index)) &&
              fourWords(phrase.slice(m.index + 1), count - 1),
          )
    assert(fourWords(password, 4))
  })
  result = await terminal(['bash', setup])
  check('completed setup resumes and prints its recovery sheet', () => {
    assert.equal(result.code, 0)
    assert(result.output.includes(`Backup password: ${password}`))
    assert(result.output.includes('Installation ID:'))
    assert(result.output.includes('1. Plug in'))
    assert(!result.output.includes('AGE-SECRET-KEY-'))
  })
  check('the cron schedule has the three intended streams', () => {
    const cron = readFileSync(join(root, 'cron/lesson3-backups'), 'utf8')
    assert(cron.includes('0 2 * * * root'))
    assert(cron.includes('--label weekly'))
    assert(cron.includes('--label monthly'))
    assert.equal(statSync(join(root, 'cron/lesson3-backups')).mode & 0o777, 0o644)
  })
  const receipt = JSON.parse(readFileSync(join(root, 'out/ops/backup-setup.json'), 'utf8'))
  check('the public receipt has no secrets and names the configured recipient', () => {
    assert.equal(receipt.recipient, recipient)
    assert(receipt.keyCreatedAt)
    noLeaks()
  })
  check('the first-drill database has been removed', () =>
    assert.equal(sql("SELECT count(*) FROM pg_database WHERE datname LIKE 'lesson3_setup_%'"), '0'),
  )
  check('the locked identity remains private', () =>
    assert.equal(statSync(key).mode & 0o777, 0o600),
  )
  const backup = JSON.parse(readFileSync(join(root, 'out/ops/backup/disk/daily.json'), 'utf8'))
    .lastSuccess.filename
  check('both backup copies have identical bytes', () =>
    assert.equal(hash(join(disk, 'daily', backup)), hash(join(usb, 'daily', backup))),
  )
  result = await terminal(
    ['bash', restore, '--local-file', join(usb, 'daily', backup), '--into', 'probe_school_wrong'],
    { mode: 'wrong', identity: key },
  )
  check('the wrong password refuses recovery before touching the target database', () => {
    assert.notEqual(result.code, 0)
    assert.equal(sql("SELECT count(*) FROM pg_database WHERE datname = 'probe_school_wrong'"), '0')
  })
  result = await terminal(
    ['bash', restore, '--local-file', join(usb, 'daily', backup), '--into', 'probe_school_right'],
    { identity: key },
  )
  check('the right password restores the USB copy through the complete drill', () => {
    assert.equal(result.code, 0)
    assert(result.output.includes('RESTORE DRILL PASSED'))
  })
  sql('DROP DATABASE probe_school_right;')
  result = await terminal(
    ['bash', restore, '--local-file', join(disk, 'daily', backup), '--into', 'probe_school_ares'],
    { identity: join(root, 'keys/identity') },
  )
  check('ARES independently restores the same new backup', () => {
    assert.equal(result.code, 0)
    assert(result.output.includes('RESTORE DRILL PASSED'))
  })
  sql('DROP DATABASE probe_school_ares;')
  check('recovery tests leave the live lesson-plan records unchanged', () =>
    assert.equal(livePlans(), originalPlans),
  )
  result = await terminal(['bash', setup], { mode: 'wrong-resume' })
  check('a wrong resume password never replaces the saved key', () => {
    assert.notEqual(result.code, 0)
    assert.equal(hash(key), lockedHash)
  })
  renameSync(key, `${key}.probe-kept`)
  result = await terminal(['bash', setup])
  check('a missing published key cannot cause silent generation of another', () => {
    assert.notEqual(result.code, 0)
    assert(!existsSync(key))
    assert.equal(hash(`${key}.probe-kept`), lockedHash)
  })
  renameSync(`${key}.probe-kept`, key)
  result = await terminal([
    'bash',
    '-c',
    'bash "$1" >"$2"',
    '_',
    setup,
    join(root, 'out/setup-stdout.log'),
  ])
  check('redirected stdout contains neither the password nor the recovery sheet', () => {
    assert.equal(result.code, 0)
    const log = readFileSync(join(root, 'out/setup-stdout.log'), 'utf8')
    assert(!log.includes(password))
    assert(!log.includes('RECOVERY SHEET'))
    assert(result.output.includes(`Backup password: ${password}`))
  })
  result = await terminal(['bash', '-a', '-x', setup])
  check('shell tracing and inherited auto-export cannot echo the password', () => {
    assert.equal(result.code, 0)
    assert.equal(result.output.split(password).length - 1, 1)
    assert(!result.output.includes('PASSWORD='))
  })
  check('no password or plaintext identity leaked at completion', noLeaks)

  // A separate operator setup proves the custom-password and no-USB path without replacing the
  // first setup's key. Both use this throwaway database; all new paths remain in the sandbox.
  const custom = join(root, 'custom-setup')
  for (const directory of ['scripts/lib', 'scripts/vendor', 'out/ops'])
    mkdirSync(join(custom, directory), { recursive: true })
  for (const file of ['setup-school-backups.sh', 'backup-db.sh', 'restore-db.sh', 'lib.sh'])
    writeFileSync(join(custom, 'scripts', file), readFileSync(join(root, 'scripts', file)), {
      mode: 0o755,
    })
  for (const file of ['backup-common.sh', 'backup-destinations.sh', 'backup-password.sh'])
    writeFileSync(join(custom, 'scripts/lib', file), readFileSync(join(root, 'scripts/lib', file)))
  writeFileSync(
    join(custom, 'scripts/vendor/eff_large_wordlist.txt'),
    readFileSync(join(root, 'scripts/vendor/eff_large_wordlist.txt')),
  )
  writeFileSync(join(custom, 'compose.yaml'), readFileSync(join(root, 'compose.yaml')))
  const customDisk = join(custom, 'disk')
  writeFileSync(
    join(custom, '.env'),
    readFileSync(join(root, '.env'), 'utf8').replace(
      /^BACKUP_DISK_DIR=.*$/m,
      `BACKUP_DISK_DIR=${customDisk}`,
    ),
  )
  password = randomBytes(16).toString('hex')
  secrets.add(password)
  result = await terminal(
    [
      'bash',
      '-c',
      'bash "$1" >"$2"',
      '_',
      join(custom, 'scripts/setup-school-backups.sh'),
      join(custom, 'out/setup-stdout.log'),
    ],
    {
      mode: 'custom',
      workdir: custom,
      usbChoice: 'n',
      extraEnv: { BACKUP_CRON_DIR: join(custom, 'cron') },
    },
  )
  check('a valid custom password completes setup without a USB drive', () => {
    assert.equal(result.code, 0)
    assert(result.output.includes(`Backup password: ${password}`))
    assert(result.output.includes('USB/cloud backups: not configured'))
    assert(existsSync(join(customDisk, 'school-recovery-key.age')))
  })
  check('the disk-only custom setup proves its first restore', () =>
    assert(existsSync(join(custom, 'out/ops/.school-backup-setup/drill'))),
  )
  check('the custom setup also leaves no password or unlocked identity on disk', () => {
    for (const path of [
      join(custom, 'out'),
      customDisk,
      join(custom, 'cron'),
      join(custom, '.env'),
    ]) {
      const scan = (entry) => {
        if (statSync(entry).isDirectory())
          for (const name of readdirSync(entry)) scan(join(entry, name))
        else {
          const bytes = readFileSync(entry)
          for (const secret of secrets) assert(!bytes.includes(Buffer.from(secret)))
          assert(!bytes.includes(Buffer.from('AGE-SECRET-KEY-')))
        }
      }
      scan(path)
    }
  })
  console.log(`school setup (real stack): ${checks} checks passed`)
} catch (error) {
  // Never print the raw terminal transcript: it contains the recovery sheet by design.
  console.error(`school setup probe failed: ${error.message}`)
  const redacted = lastOutput.replaceAll(
    /RECOVERY SHEET[^\n]*|Backup password:[^\n]*/g,
    '[recovery sheet redacted]',
  )
  let diagnostic = redacted
  for (const secret of secrets) diagnostic = diagnostic.replaceAll(secret, '[redacted]')
  diagnostic = diagnostic.replaceAll(/AGE-SECRET-KEY-[A-Z0-9]+/g, '[identity redacted]')
  console.error(diagnostic.slice(-3000))
  process.exitCode = 1
}
