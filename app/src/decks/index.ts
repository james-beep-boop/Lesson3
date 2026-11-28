import { AsyncLocalStorage } from 'node:async_hooks'
import { statSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import '../generator/attributionEnvironment'
import type { AresDataObject } from '../generator'

type VendorBuild = (
  dataPath: string,
  lessonNumber: number,
  specPath: string,
  outputPath: string,
) => Promise<{ errors: string[] }>

const renderArt = new AsyncLocalStorage<ReadonlyMap<string, string>>()
let vendorBuild: VendorBuild | undefined

function loadVendorBuild(): VendorBuild {
  // Turbopack rewrites bundled __dirname. The upstream builder uses it to find config, logos and
  // icons, so load it with Node from its original directory. The fixed path.join calls tell
  // Turbopack's standalone tracer to ship those directories and the runtime packages it needs.
  const vendor = join(process.cwd(), 'src/decks/vendor')
  const dependencies = [
    join(process.cwd(), 'node_modules/@napi-rs'),
    join(process.cwd(), 'node_modules/pptxgenjs'),
    join(process.cwd(), 'node_modules/image-size'),
    join(process.cwd(), 'node_modules/js-yaml'),
    join(process.cwd(), 'node_modules/argparse'),
    join(process.cwd(), 'node_modules/jszip'),
    join(process.cwd(), 'node_modules/lie'),
    join(process.cwd(), 'node_modules/immediate'),
    join(process.cwd(), 'node_modules/pako'),
    join(process.cwd(), 'node_modules/readable-stream'),
    join(process.cwd(), 'node_modules/core-util-is'),
    join(process.cwd(), 'node_modules/inherits'),
    join(process.cwd(), 'node_modules/process-nextick-args'),
    join(process.cwd(), 'node_modules/safe-buffer'),
    join(process.cwd(), 'node_modules/string_decoder'),
    join(process.cwd(), 'node_modules/util-deprecate'),
    join(process.cwd(), 'node_modules/setimmediate'),
  ]
  for (const directory of dependencies) statSync(directory)

  const requireVendor = createRequire(join(vendor, 'generators/presentations/build_deck.js'))
  const art = requireVendor('./lib/art.js') as { artPath: (id: string) => string | null }
  const vendorArtPath = art.artPath
  // The builder captures this function at load time. The paths themselves are per render.
  art.artPath = (id) => renderArt.getStore()?.get(id) ?? vendorArtPath(id)

  const quiz = requireVendor('./lib/quizlinks.js') as {
    plan: (meta: unknown, lesson: number, slides: { quiz_links?: string[] }[]) => unknown
  }
  // Lesson3 stores the links on the slides. The upstream registry references quiz source files
  // that are not part of a Lesson3 import.
  quiz.plan = (_meta, _lesson, slides) => ({
    unplaced: [],
    bySlide: new Map(
      slides.map((slide, index) => [
        index,
        (slide.quiz_links ?? []).map((url, linkIndex) => {
          const q = /\/question\/(q\d+)(?:[?#]|$)/.exec(url)?.[1]
          const n = q ? Number(q.slice(1)) : linkIndex + 1
          return { url, n, q: q ?? `q${String(n).padStart(2, '0')}` }
        }),
      ]),
    ),
  })

  return (requireVendor('./build_deck.js') as { build: VendorBuild }).build
}

/** Render one lesson's deck from the merged ARES spec and bundle data. */
export async function buildDeck(
  spec: object,
  data: AresDataObject,
  lessonNumber: number,
  art: ReadonlyMap<string, Buffer> = new Map(),
): Promise<Buffer> {
  const build = (vendorBuild ??= loadVendorBuild())

  // Upstream's exported build takes paths and writes a layout report alongside the deck.
  const dir = await mkdtemp(join(tmpdir(), 'lesson3-deck-'))
  try {
    const dataPath = join(dir, 'bundle.json')
    const specPath = join(dir, 'spec.json')
    const outputPath = join(dir, 'deck.pptx')
    await writeFile(dataPath, JSON.stringify(data))
    await writeFile(specPath, JSON.stringify(spec))
    const artPaths = new Map<string, string>()
    for (const [id, bytes] of art) {
      // A generated basename keeps the path independent of the uploaded art id.
      const file = join(dir, `art-${artPaths.size}.png`)
      await writeFile(file, bytes)
      artPaths.set(id, file)
    }
    const { errors } = await renderArt.run(artPaths, () =>
      build(dataPath, lessonNumber, specPath, outputPath),
    )
    if (errors.length) {
      throw new Error(`Lesson ${lessonNumber} deck failed to render:\n${errors.join('\n')}`)
    }
    return await readFile(outputPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
