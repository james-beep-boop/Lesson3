import { getPayload } from 'payload'
import config from './config.ts'
const payload = await getPayload({ config })
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)
const words = (q: string) => q.trim().split(/\s+/).filter(Boolean).map(esc)
const titleOnly = (q: string) => ({ title: { like: esc(q) } })
const titleBody = (q: string) => ({ and: words(q).map((w) => ({ or: [{ title: { like: w } }, { body: { like: w } }] })) })
const time = async (where: any) => {
  const runs: number[] = []; let r: any
  for (let i = 0; i < 11; i++) { const t0 = performance.now(); r = await payload.find({ collection: 'discussion-topics', where, sort: '-lastActivityAt', limit: 20, depth: 0, overrideAccess: true, select: { title: true } }); if (i) runs.push(performance.now() - t0) }
  runs.sort((a, b) => a - b); return { matches: r.totalDocs, ms: +((runs[4] + runs[5]) / 2).toFixed(1) }
}
const out: Record<string, unknown> = {}
for (const q of ['lesson', 'somo', 'fractions tathmini', 'photosynthesis', 'zzqxv', 'lesson fractions photosynthesis'])
  out[q] = { titleOnly: await time(titleOnly(q)), titlePlusOpening: await time(titleBody(q)) }
console.log(JSON.stringify(out))
// split-across-fields semantics
const t = await payload.create({ collection: 'discussion-topics', data: { title: 'Fractions question', body: 'How should the tathmini work?', lastActivityAt: new Date().toISOString() }, overrideAccess: true })
const r = await payload.find({ collection: 'discussion-topics', where: { and: [titleBody('fractions tathmini'), { id: { equals: t.id } }] }, depth: 0, overrideAccess: true })
console.log('split title/opening match:', r.totalDocs === 1)
await payload.delete({ collection: 'discussion-topics', id: t.id, overrideAccess: true })
const avg = await payload.db.drizzle.execute(`select round(avg(length(title))) t, round(avg(length(body))) b from discussion_topics` as any)
console.log('avg chars title/body:', JSON.stringify((avg as any).rows?.[0] ?? avg))
process.exit(0)
