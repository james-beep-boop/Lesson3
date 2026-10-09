import { getPayload } from 'payload'
import config from './config.ts'
const payload = await getPayload({ config })
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)
const cases = ['lesson', 'somo', 'fractions tathmini', 'photosynthesis', 'zzqxv', 'lesson fractions photosynthesis', 'Lesson Somo']
const out: Record<string, unknown> = {}
for (const q of cases) {
  const where = { title: { like: esc(q) } }
  const runs: number[] = []
  let r: any
  for (let i = 0; i < 11; i++) {
    const t0 = performance.now()
    r = await payload.find({ collection: 'discussion-topics', where, sort: '-lastActivityAt', limit: 20, page: 1, depth: 0, overrideAccess: true, select: { title: true } })
    if (i) runs.push(performance.now() - t0)
  }
  runs.sort((a, b) => a - b)
  const deepPage = Math.max(1, r.totalPages)
  const t0 = performance.now()
  await payload.find({ collection: 'discussion-topics', where, sort: '-lastActivityAt', limit: 20, page: deepPage, depth: 0, overrideAccess: true, select: { title: true } })
  out[q] = { matches: r.totalDocs, page1WithCountMs_median: +((runs[4] + runs[5]) / 2).toFixed(1), lastPageMs: +(performance.now() - t0).toFixed(1), sample: r.docs[0]?.title }
}
console.log(JSON.stringify(out, null, 1))
// semantics: every word must be in the title, in any order
const a = await payload.find({ collection: 'discussion-topics', where: { title: { like: 'fractions lesson' } }, limit: 3, depth: 0, overrideAccess: true })
console.log('every-word check:', a.docs.map((d: any) => d.title))
process.exit(0)
