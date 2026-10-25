import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hashes = vi.hoisted(() =>
  vi.fn(
    (
      password: string,
      salt: string,
      iterations: number,
      length: number,
      digest: string,
      callback: (error: Error | null, value: Buffer) => void,
    ) => callback(null, Buffer.alloc(length)),
  ),
)
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  pbkdf2: hashes,
}))
import { equalizeLoginPasswordWork } from '../../src/hooks/loginPasswordWork'

const execute = async (user: unknown) => {
  const findOne = vi.fn().mockResolvedValue(user)
  const updateOne = vi.fn().mockResolvedValue(user)
  const args = { data: { email: 'teacher@lesson3.local', password: 'wrong-password' } }
  const result = await equalizeLoginPasswordWork({
    operation: 'login',
    args,
    req: { payload: { db: { findOne, updateOne } } },
  } as never)
  expect(result).toBe(args)
  return { findOne, updateOne }
}
beforeEach(() => {
  hashes.mockClear()
})
describe('login password workload', () => {
  it('unknown accounts perform both dummy hash formats before native generic refusal', async () => {
    await execute(null)
    expect(hashes.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      [25_000, 512],
      [600_000, 32],
    ])
  })
  it('current accounts perform only the legacy dummy; native Payload performs current work', async () => {
    await execute({ id: 1, hash: 'pbkdf2-sha256-v1:abcd', salt: 'salt' })
    expect(hashes.mock.calls.map((c) => [c[2], c[3]])).toEqual([[25_000, 512]])
  })
  it('legacy accounts perform only the current dummy; native Payload performs legacy work', async () => {
    await execute({ id: 1, hash: 'abcd', salt: 'salt' })
    expect(hashes.mock.calls.map((c) => [c[2], c[3]])).toEqual([[600_000, 32]])
  })
  it('clears pre-upgrade account locks before native login can disclose or enforce one', async () => {
    const { updateOne } = await execute({
      id: 1,
      hash: 'abcd',
      salt: 'salt',
      lockUntil: '2099-01-01',
      loginAttempts: 5,
    })
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lockUntil: null, loginAttempts: 0 } }),
    )
  })
  it('pins dummy parameters to the installed Payload verifier formats', () => {
    const root = dirname(createRequire(import.meta.url).resolve('payload'))
    const source = readFileSync(
      join(root, 'auth/strategies/local/generatePasswordSaltHash.js'),
      'utf8',
    )
    for (const text of [
      'currentPasswordHashIterations = 600000',
      'currentPasswordHashKeyLength = 32',
      'legacyPasswordHashIterations = 25000',
      'legacyPasswordHashKeyLength = 512',
    ])
      expect(source).toContain(text)
  })
  it('keeps protection wired into Users before native authentication', () => {
    const source = readFileSync(new URL('../../src/collections/Users.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/maxLoginAttempts:\s*0/)
    expect(source).toMatch(/endpoints:\s*\[\s*protectedLoginEndpoint/)
    expect(source).toMatch(
      /beforeOperation:\s*\[[^\]]*rateLimitAuthOperations,\s*equalizeLoginPasswordWork/,
    )
  })
})
