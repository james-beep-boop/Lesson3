import { getPayload } from 'payload'
import config from '@payload-config'
import { schoolNameForRender } from './systemFlags'

/** Auth-page titles keep their existing wording when no school name is configured. */
export async function schoolPageMetadata(fallback = 'Lesson Plan Editor') {
  const name = await schoolNameForRender(await getPayload({ config }))
  return { title: name ? `${name} — Lesson Plan Editor` : fallback }
}
