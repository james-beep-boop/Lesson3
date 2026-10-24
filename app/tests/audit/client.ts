import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { APIRequestContext, APIResponse } from '@playwright/test'

export const auditActors = [
  'anonymous',
  'unverified',
  'teacher',
  'teacherPeer',
  'editorA',
  'editorAPeer',
  'editorB',
  'subjectAdminA',
  'subjectAdminB',
  'siteAdmin',
] as const
export type AuditActor = (typeof auditActors)[number]
export const auditActorLabels: Record<AuditActor, string> = {
  anonymous: 'Anonymous',
  unverified: 'Unverified account',
  teacher: 'Teacher',
  teacherPeer: 'Peer teacher',
  editorA: 'Teacher with editing access in A',
  editorAPeer: 'Peer teacher with editing access in A',
  editorB: 'Teacher with editing access in B',
  subjectAdminA: 'Subject administrator in A with editing access in B',
  subjectAdminB: 'Subject administrator in B',
  siteAdmin: 'Site administrator',
}
export interface AuditFixture {
  run: string
  password: string
  accounts: Record<string, { id: number; email: string; verified: boolean }>
  scopes: Record<string, number>
  plans: Record<string, { plan: number; version: number }>
  topic?: number
}
export function auditFixture(): AuditFixture {
  const file = process.env.LESSON3_AUDIT_FIXTURE_FILE
  assert(file, 'A private synthetic fixture file is required')
  const fixture = JSON.parse(readFileSync(file, 'utf8')) as AuditFixture
  assert(fixture.run.startsWith('l3audit-'))
  for (const actor of auditActors.filter((value) => value !== 'anonymous')) {
    assert(fixture.accounts[actor]?.email.endsWith('@lesson3.local'))
  }
  return fixture
}
export function auditBaseURL(): string {
  const raw = process.env.LESSON3_AUDIT_BASE_URL
  assert(raw, 'An explicit internal audit base URL is required')
  const url = new URL(raw)
  assert.equal(url.origin, 'http://lesson3-audit:3000', 'Refuse a non-audit target')
  return url.origin
}
/** Keep query names for route reconciliation; never serialize credential/query values. */
export function safeURL(raw: string): string {
  const url = new URL(raw, auditBaseURL())
  const keys = [...new Set(url.searchParams.keys())].sort()
  return url.pathname + (keys.length ? `?${keys.map((key) => `${key}=…`).join('&')}` : '')
}
/** Same-origin API client; no automatic retries of uncertain mutations. */
export function auditAPI(request: APIRequestContext) {
  return async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
  ): Promise<APIResponse> => {
    const url = new URL(path, auditBaseURL())
    assert.equal(url.origin, auditBaseURL())
    return request.fetch(url.href, {
      method,
      data,
      timeout: 20_000,
      maxRetries: 0,
      failOnStatusCode: false,
    })
  }
}
