import { useEffect, useState } from 'react'
import { forumSend } from '@/lib/forum.ts'
import { api, clearSession, currentAccount, saveSession, type Account } from '@/lib/session.ts'

export function AuthCard({
  signature = '',
  onSession,
}: {
  signature?: string
  onSession?: () => void
}) {
  const [account, setAccount] = useState<Account | null>(null)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [draft, setDraft] = useState(signature)
  const [seenSignature, setSeenSignature] = useState(signature)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const refresh = () => {
      void currentAccount().then((next) => setAccount(next))
    }
    refresh()
    window.addEventListener('khuiwong-auth', refresh)
    return () => window.removeEventListener('khuiwong-auth', refresh)
  }, [])

  if (signature !== seenSignature) {
    setSeenSignature(signature)
    setDraft(signature)
  }

  async function authenticate(path: '/api/register' | '/api/login') {
    setError(null)
    setPending(true)
    try {
      const data = await api<{ token: string; account: Account }>(path, {
        method: 'POST',
        body: JSON.stringify({ nickname, password }),
      })
      saveSession(data.token)
      setAccount(data.account)
      setPassword('')
      window.dispatchEvent(new Event('khuiwong-auth'))
      onSession?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    clearSession()
    setAccount(null)
    window.dispatchEvent(new Event('khuiwong-auth'))
    onSession?.()
  }

  async function saveSignature() {
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      await forumSend('/api/forum/signature', 'PUT', { signature: draft })
      setSaved(true)
      onSession?.()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกลายเซ็นไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  if (account) {
    return (
      <div className="smf-auth">
        <p>
          <span data-testid="session-name">{account.nickname}</span>
        </p>
        <label className="smf-field">
          <span>Signature</span>
          <textarea
            className="smf-area"
            value={draft}
            maxLength={300}
            aria-label="ลายเซ็น"
            data-testid="signature"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="smf-form-actions">
          <button type="button" className="smf-button" disabled={pending} onClick={() => void saveSignature()}>
            Save signature
          </button>
          <button type="button" className="smf-button smf-button-alt" onClick={() => void logout()}>
            Logout
          </button>
        </div>
        {saved ? <p className="smf-small">บันทึกลายเซ็นแล้ว</p> : null}
        {error ? (
          <p role="alert" className="smf-error">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form
      className="smf-auth"
      onSubmit={(event) => {
        event.preventDefault()
        void authenticate('/api/login')
      }}
    >
      <label className="smf-field">
        <span>Username</span>
        <input
          className="smf-input"
          value={nickname}
          autoComplete="username"
          aria-label="ชื่อบัญชี"
          data-testid="account-name"
          onChange={(event) => setNickname(event.target.value)}
        />
      </label>
      <label className="smf-field">
        <span>Password</span>
        <input
          className="smf-input"
          type="password"
          value={password}
          autoComplete="current-password"
          aria-label="รหัสผ่าน"
          data-testid="account-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <div className="smf-form-actions">
        <button type="submit" className="smf-button" disabled={pending}>
          เข้าสู่ระบบ
        </button>
        <button type="button" className="smf-button smf-button-alt" disabled={pending} data-testid="register" onClick={() => void authenticate('/api/register')}>
          สมัคร
        </button>
      </div>
      {error ? (
        <p role="alert" className="smf-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
