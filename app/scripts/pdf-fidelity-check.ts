/**
 * PDF fidelity gate (GATE) — picks/confirms the DOCX→PDF engine (SPEC §9).
 *
 * The question this answers: does the local office engine (Gotenberg/LibreOffice, behind
 * the docxToPdf seam) reproduce the generator's DOCX *layout* faithfully — tables, merges,
 * shading, column widths — not just its text? Text alone can't tell us; we compare RENDERED
 * PAGES against an oracle.
 *
 * Oracle = Word's own DOCX→PDF of the SAME source DOCX. Because both converters get the
 * identical generated DOCX, any difference is pure converter fidelity (the Resource-column
 * caveat that the *generator* fidelity test carries does not apply here — same input both sides).
 *
 * Method: convert the approved bio_1_4 DOCX via the seam → rasterize candidate + oracle to
 * PNG per page (`pdftoppm`) → pixel-diff each page (ImageMagick `compare -metric AE`) →
 * assert the differing-pixel fraction is within tolerance.
 *
 * Run (on the Rock, where Gotenberg + poppler + imagemagick live; GOTENBERG_URL reachable):
 *   cd app && npx tsx scripts/pdf-fidelity-check.ts
 *
 * Required staged assets in ARES_DEMO_PATH (alongside the approved DOCX):
 *   Biology_Chemicals_of_Life_CBE_LessonSequence.oracle.pdf   (Word: open the DOCX, Save as PDF)
 *   Biology_Chemicals_of_Life_FinalExplanation.oracle.pdf
 *   Biology_Chemicals_of_Life_SummaryTable.oracle.pdf
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { docxToPdf } from '../src/generator/docxToPdf'

const DEMO = process.env.ARES_DEMO_PATH ?? path.join(os.homedir(), 'Desktop', 'ares-docx-fidelity-demo')

// Per-page tolerance: fraction of pixels allowed to differ. LibreOffice vs Word font hinting
// and anti-aliasing differ at the sub-pixel level even on identical layout, so 0 is unrealistic;
// a layout regression (shifted table, lost merge, wrong width) moves whole regions, far above this.
const TOLERANCE = Number(process.env.PDF_FIDELITY_TOLERANCE ?? '0.01') // 1%
const DPI = 150

const DOCS = [
  'Biology_Chemicals_of_Life_CBE_LessonSequence',
  'Biology_Chemicals_of_Life_FinalExplanation',
  'Biology_Chemicals_of_Life_SummaryTable',
] as const

/** Fail fast with an actionable message if a required external tool is absent. */
function requireTool(bin: string, hint: string): void {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' })
  } catch {
    throw new Error(`Required tool "${bin}" not found — ${hint}`)
  }
}

/** Rasterize a PDF to per-page PNGs `${prefix}-N.png`, return their sorted paths. */
function rasterize(pdfPath: string, dir: string, prefix: string): string[] {
  execFileSync('pdftoppm', ['-png', '-r', String(DPI), pdfPath, path.join(dir, prefix)])
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f))
}

/** Differing-pixel fraction between two same-size PNGs, via ImageMagick compare -metric AE. */
function pageDiffFraction(a: string, b: string): number {
  const [w, h] = execFileSync('identify', ['-format', '%w %h', a]).toString().trim().split(/\s+/).map(Number)
  let differing = 0
  try {
    // `compare` exits non-zero when images differ; the AE count is written to stderr.
    execFileSync('compare', ['-metric', 'AE', '-fuzz', '5%', a, b, 'null:'], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? ''
    differing = Number(stderr.replace(/[^0-9.eE+-]/g, '')) || 0
  }
  return w && h ? differing / (w * h) : 1
}

async function compareDocPdf(name: string, dir: string): Promise<boolean> {
  const docxPath = path.join(DEMO, `${name}.docx`)
  const oraclePath = path.join(DEMO, `${name}.oracle.pdf`)
  if (!existsSync(docxPath)) {
    console.log(`  ✗ ${name}: source DOCX missing (${docxPath})`)
    return false
  }
  if (!existsSync(oraclePath)) {
    console.log(`  ✗ ${name}: oracle PDF missing — stage ${name}.oracle.pdf (Word: open the DOCX → Save as PDF)`)
    return false
  }

  const candidatePdf = await docxToPdf(readFileSync(docxPath), `${name}.docx`)
  const candidatePath = path.join(dir, `${name}.candidate.pdf`)
  writeFileSync(candidatePath, candidatePdf)

  const candPages = rasterize(candidatePath, dir, `${name}.cand`)
  const oraclePages = rasterize(oraclePath, dir, `${name}.oracle`)

  if (candPages.length !== oraclePages.length) {
    console.log(`  ✗ ${name}: page count ${candPages.length} (candidate) vs ${oraclePages.length} (oracle)`)
    return false
  }

  let worst = 0
  for (let i = 0; i < candPages.length; i++) {
    const frac = pageDiffFraction(candPages[i], oraclePages[i])
    worst = Math.max(worst, frac)
    const flag = frac <= TOLERANCE ? 'ok' : 'OVER'
    console.log(`    page ${i + 1}: ${(frac * 100).toFixed(3)}% differing [${flag}]`)
  }
  const pass = worst <= TOLERANCE
  console.log(`  ${pass ? '✓' : '✗'} ${name}: worst page ${(worst * 100).toFixed(3)}% (tolerance ${(TOLERANCE * 100).toFixed(2)}%)`)
  return pass
}

async function main() {
  console.log('PDF fidelity gate — Gotenberg/LibreOffice vs Word oracle (bio_1_4)')
  console.log(`DEMO=${DEMO}  GOTENBERG_URL=${process.env.GOTENBERG_URL ?? '(default http://gotenberg:3000)'}`)
  requireTool('pdftoppm', 'install poppler-utils')
  requireTool('compare', 'install imagemagick')
  requireTool('identify', 'install imagemagick')

  const dir = mkdtempSync(path.join(os.tmpdir(), 'pdf-fidelity-'))
  const results: boolean[] = []
  for (const name of DOCS) results.push(await compareDocPdf(name, dir))

  const passed = results.filter(Boolean).length
  console.log(`\n${'='.repeat(50)}`)
  console.log(`GATE: ${passed}/${results.length} documents within PDF layout tolerance`)
  if (passed !== results.length) process.exit(1)
  console.log('✓ PDF FIDELITY GATE PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
