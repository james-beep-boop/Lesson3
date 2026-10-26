import { getPayload } from 'payload'
import config from '@payload-config'
import { schoolNameForRender } from './schoolName'

/** Auth-page titles keep their existing wording when no school name is configured. */
export async function schoolPageMetadata(fallback = 'ARES Lesson Plans') {
  const name = await schoolNameForRender(await getPayload({ config }))
  return { title: name ? `${name} — ARES Lesson Plans` : fallback }
}
