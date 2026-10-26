import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import { takeAdvisoryLock } from './txDb'

/** Trusted operator path. Shares Save's lock so an open Manage form becomes stale after commissioning.
 *  The field's own hook validates the name, so a bad one is refused here as everywhere else. */
export async function setSchoolName(payload: Payload, schoolName: string): Promise<void> {
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
  } catch (e) {
    await killTransaction(req)
    throw e
  }
}
