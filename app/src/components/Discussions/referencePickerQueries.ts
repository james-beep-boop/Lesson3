/**
 * The lesson-reference picker's REST queries (discussions 4a). Built here rather than in the component so
 * the wire test (`tests/http/discussions.http.spec.ts`) sends exactly what the browser sends.
 *
 * ⚑ EXISTING REST ONLY, AS THE VIEWER — no new endpoint, so no new authorization boundary.
 */
import { likeAllWords } from '@/lib/discussionText'

/** `GET /api/lesson-plans` — readable lessons whose title contains every typed word. */
export const lessonSearchPath = (query: string): string =>
  `/api/lesson-plans?${new URLSearchParams({
    'where[title][like]': likeAllWords(query) ?? '',
    depth: '0',
    limit: '10',
    pagination: 'false', // the list is capped at 10; nothing reads a total, so skip Payload's COUNT
    sort: 'title',
    'select[title]': 'true',
  })}`

/**
 * `GET /api/lesson-bundle-versions` — one lesson's readable versions, newest first. ⚑ Authors are
 * populated NAMES ONLY (`populate[users][name]`): the picker shows who saved each version, and nothing
 * else about them crosses the wire.
 */
export const lessonVersionsPath = (planId: number): string =>
  `/api/lesson-bundle-versions?${new URLSearchParams({
    'where[lessonPlan][equals]': String(planId),
    depth: '1',
    pagination: 'false',
    sort: '-createdAt',
    'select[semver]': 'true',
    'select[title]': 'true',
    'select[createdAt]': 'true',
    'select[author]': 'true',
    'select[meta][substrand_name]': 'true',
    'populate[users][name]': 'true',
  })}`
