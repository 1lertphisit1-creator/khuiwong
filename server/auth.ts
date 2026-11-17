import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  deleteSession,
  findAccountById,
  findAccountByKey,
  findSession,
  insertAccount,
  insertSession,
  type AccountRow,
} from './db.ts'

const SESSION_MS = 1000 * 60 * 60 * 24 * 30
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

export function nicknameKey(nickname: string) {
  return nickname.toLocaleLowerCase('en-US')
}

export function cleanNickname(input: unknown) {
  if (typeof input !== 'string') return null
  const name = stripControls(input).trim()
  const chars = [...name]
  if (chars.length < 2 || chars.length > 24) return null
  if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(name)) return null
  return chars.join('')
}

export function cleanPassword(input: unknown) {
  if (typeof input !== 'string') return null
  if (input.length < 8 || input.length > 72) return null
  return input
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 32).toString('hex')
  return `scrypt$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const actual = scryptSync(password, salt, 32)
  const expected = Buffer.from(hash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export function registerAccount(nickname: string, password: string) {
  const key = nicknameKey(nickname)
  if (findAccountByKey(key)) return { error: 'ชื่อนี้ถูกใช้แล้ว' as const }
  const account: AccountRow = {
    id: randomBytes(12).toString('base64url'),
    nickname,
    nickname_key: key,
    password_hash: hashPassword(password),
    created_at: Date.now(),
  }
  insertAccount(account)
  const token = createSession(account.id)
  return { account: publicAccount(account), token }
}

export function loginAccount(nickname: string, password: string, ipKey: string) {
  if (tooManyAttempts(ipKey)) return { error: 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่แล้วลองใหม่' as const }
  const account = findAccountByKey(nicknameKey(nickname))
  if (!account || !verifyPassword(password, account.password_hash)) {
    noteFailure(ipKey)
    return { error: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง' as const }
  }
  loginAttempts.delete(ipKey)
  return { account: publicAccount(account), token: createSession(account.id) }
}

export function logoutToken(token: string) {
  deleteSession(hashToken(token))
}

export function accountFromToken(token: string | undefined | null) {
  if (!token) return null
  const session = findSession(hashToken(token))
  if (!session) return null
  if (session.expires_at < Date.now()) {
    deleteSession(hashToken(token))
    return null
  }
  const account = findAccountById(session.account_id)
  return account ? publicAccount(account) : null
}

export function publicAccount(account: AccountRow) {
  return { id: account.id, nickname: account.nickname }
}

function createSession(accountId: string) {
  const token = randomBytes(32).toString('base64url')
  insertSession(hashToken(token), accountId, Date.now() + SESSION_MS)
  return token
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function tooManyAttempts(ipKey: string) {
  const entry = loginAttempts.get(ipKey)
  if (!entry) return false
  if (entry.resetAt < Date.now()) {
    loginAttempts.delete(ipKey)
    return false
  }
  return entry.count >= 8
}

function noteFailure(ipKey: string) {
  const now = Date.now()
  const entry = loginAttempts.get(ipKey)
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ipKey, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return
  }
  entry.count += 1
}

function stripControls(input: string) {
  let out = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) continue
    out += char
  }
  return out
}
