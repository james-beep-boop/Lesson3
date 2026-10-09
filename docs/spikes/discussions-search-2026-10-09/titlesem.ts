import { getPayload } from 'payload'
import config from './config.ts'
const payload = await getPayload({ config })
const mk = (title: string) => payload.create({ collection: 'discussion-topics', data: { title, body: 'x', lastActivityAt: new Date().toISOString() }, overrideAccess: true })
const made = await Promise.all(['Fractions lesson plenary', 'Lesson on FRACTIONS', 'Fractions only', 'Score 50 percent', 'Kazi ya sehemu: tathmini'].map(mk))
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c)
for (const q of ['fractions lesson', 'tathmini sehemu', '50%', 'fract']) {
  const r = await payload.find({ collection: 'discussion-topics', where: { and: [{ title: { like: esc(q) } }, { id: { in: made.map((m) => m.id) } }] }, depth: 0, overrideAccess: true })
  console.log(JSON.stringify(q), '→', r.docs.map((d: any) => d.title))
}
await payload.delete({ collection: 'discussion-topics', where: { id: { in: made.map((m) => m.id) } }, overrideAccess: true })
process.exit(0)
