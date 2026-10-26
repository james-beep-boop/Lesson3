import type { Payload } from 'payload'
import type { IngestReport } from './index'
import { relId } from '../lib/relId'

/** Called by the authorized web endpoint only, after the import transaction has committed.
 * One message per affected subject-grade. Body links are plain text (the messages grammar).
 * Delivery failures are reported without retrying or undoing the committed lesson set.
 */
export async function sendReleaseMessages(
  payload: Payload,
  sender: number,
  report: IngestReport,
): Promise<string[]> {
  const warnings: string[] = []
  const byGrade = new Map<number, typeof report.bundles>()
  for (const bundle of report.bundles.filter((b) => b.action === 'revised')) {
    byGrade.set(bundle.subjectGrade, [...(byGrade.get(bundle.subjectGrade) ?? []), bundle])
  }
  for (const [grade, bundles] of byGrade) {
    try {
      const { docs } = await payload.find({
        collection: 'users',
        pagination: false,
        depth: 0,
        where: { 'assignments.subjectGrade': { equals: grade } },
        overrideAccess: true,
      })
      const admin = docs.find((u) =>
        u.assignments?.some((a) => relId(a.subjectGrade) === grade && a.role === 'subjectAdmin'),
      )
      if (!admin) continue
      // Bound the summary to the system-message cap while retaining every lesson's link.
      const lines = bundles.map(
        (b) =>
          `${b.title.slice(0, 60)}: ${b.previousSemver ?? 'none'} → ${b.semver}; ARES release ${b.releaseDate ?? 'not stated'}; ${b.official ? 'Official moved' : 'waiting for you'}. /lessons/${b.id}`,
      )
      await payload.create({
        collection: 'messages',
        overrideAccess: true,
        data: { sender, recipient: admin.id, body: `ARES lesson upload\n${lines.join('\n')}` },
      })
    } catch (err) {
      payload.logger.error(
        { err, subjectGrade: grade, sender },
        'ARES release message failed after import committed',
      )
      warnings.push(
        `Lessons imported, but the message to the administrator of subject-grade #${grade} could not be sent.`,
      )
    }
  }
  return warnings
}
