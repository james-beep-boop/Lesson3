import type { Payload } from 'payload'
import type { IngestReport } from './index'
import { relId } from '../lib/relId'
import { MAX_MESSAGE_LENGTH } from '../lib/messageText'

/**
 * The summary's text: a heading, then one line per lesson for as many as fit within the ordinary
 * message limit, then "…and N more" for the rest (operator decision 2026-10-27). The upload report
 * already lists every lesson, and Lesson Plans shows them; the message only has to say what to look at.
 */
export function releaseSummary(lines: string[]): string {
  let body = 'ARES lesson upload'
  for (const [i, line] of lines.entries()) {
    const left = lines.length - i - 1
    // Keep room for the closing line whenever any lesson after this one would be left out.
    const reserve = left ? `\n…and ${left} more. See Lesson Plans for the rest.`.length : 0
    if (body.length + 1 + line.length + reserve > MAX_MESSAGE_LENGTH) {
      return `${body}\n…and ${lines.length - i} more. See Lesson Plans for the rest.`
    }
    body += `\n${line}`
  }
  return body
}

/** Called by the authorized web endpoint only, after the import transaction has committed.
 * One message per affected subject-grade. Each lesson's `/lessons/<id>` path is plain text, which
 * the messages page turns into a link.
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
    const group = byGrade.get(bundle.subjectGrade)
    if (group) group.push(bundle)
    else byGrade.set(bundle.subjectGrade, [bundle])
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
      const lines = bundles.map(
        (b) =>
          `${b.title.slice(0, 60)}: ${b.previousSemver ?? 'none'} → ${b.semver}; ARES release ${b.releaseDate ?? 'not stated'}; ${b.official ? 'Official moved' : 'waiting for you'}. /lessons/${b.id}`,
      )
      await payload.create({
        collection: 'messages',
        overrideAccess: true,
        data: { sender, recipient: admin.id, body: releaseSummary(lines) },
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
