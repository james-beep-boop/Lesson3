import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import '../generator/attributionEnvironment'
import type { AresDataObject } from '../generator'

const require = createRequire(import.meta.url)

/** Render one lesson's deck from the merged ARES spec and bundle data. */
export async function buildDeck(
  spec: object,
  data: AresDataObject,
  lessonNumber: number,
): Promise<Buffer> {
  const { build } = require('./vendor/generators/presentations/build_deck.js') as {
    build: (
      dataPath: string,
      lessonNumber: number,
      specPath: string,
      outputPath: string,
    ) => Promise<{ errors: string[] }>
  }

  // Upstream's exported build takes paths and writes a layout report alongside the deck.
  const dir = await mkdtemp(join(tmpdir(), 'lesson3-deck-'))
  try {
    const dataPath = join(dir, 'bundle.json')
    const specPath = join(dir, 'spec.json')
    const outputPath = join(dir, 'deck.pptx')
    await writeFile(dataPath, JSON.stringify(data))
    await writeFile(specPath, JSON.stringify(spec))
    const { errors } = await build(dataPath, lessonNumber, specPath, outputPath)
    if (errors.length) {
      throw new Error(`Lesson ${lessonNumber} deck failed to render:\n${errors.join('\n')}`)
    }
    return await readFile(outputPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
