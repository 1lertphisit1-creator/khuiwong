const TOKEN_KEY = 'khuiwong.token'

export type Account = { id: string; nickname: string }

export function sessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveSession(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = sessionToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(path, { ...init, headers })
  const data = (await response.json().catch(() => ({}))) as { message?: string }
  if (!response.ok) throw new Error(data.message || 'คำขอไม่สำเร็จ')
  return data as T
}

export async function currentAccount() {
  if (!sessionToken()) return null
  try {
    const data = await api<{ account: Account }>('/api/me')
    return data.account
  } catch {
    clearSession()
    return null
  }
}
