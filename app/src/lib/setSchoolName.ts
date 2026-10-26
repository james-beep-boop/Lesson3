import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { parseSchoolName } from './schoolName'
import { takeAdvisoryLock } from './txDb'

/** Trusted operator path. Shares Save's lock so an open Manage form becomes stale after commissioning. */
export async function setSchoolName(payload: Payload, value: unknown): Promise<string> {
  const schoolName = parseSchoolName(value)
  const req = await createLocalReq({}, payload)
  const shouldCommit = await initTransaction(req)
  try {
    await takeAdvisoryLock(req, 'systemSettings')
    await payload.updateGlobal({
      slug: 'system-settings',
      data: { schoolName },
      overrideAccess: true,
      req,
    })
    if (shouldCommit) await commitTransaction(req)
    return schoolName
  } catch (e) {
    await killTransaction(req)
    throw e
  }
}
