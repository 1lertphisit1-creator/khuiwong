import { useEffect, useState } from 'react'
import { AuthCard } from '@/components/AuthCard.tsx'
import { useBranding } from '@/components/forum/branding.tsx'
import { Crumb, ForumLink, MemberName } from '@/components/forum/parts.tsx'
import { ActivityBlock } from '@/components/forum/Ranks.tsx'
import { forumGet, forumSend, inkColor, smfDate, type ForumMe } from '@/lib/forum.ts'
import { go } from '@/lib/route.ts'
import { sessionToken } from '@/lib/session.ts'

type SearchResult = {
  topicId: number
  subject: string
  boardId: number
  boardName: string
  lastPostAt: number
  lastPosterName: string
  lastPosterColor?: string
  snippet: string
}

export function SearchPage({ query }: { query: string }) {
  const [draft, setDraft] = useState(query)
  const [seenQuery, setSeenQuery] = useState(query)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (query !== seenQuery) {
    setSeenQuery(query)
    setDraft(query)
    if (query.trim().length < 2) setResults([])
  }

  useEffect(() => {
    if (query.trim().length < 2) return
    let stopped = false
    forumGet<{ results: SearchResult[] }>(`/api/forum/search?q=${encodeURIComponent(query)}`)
      .then((payload) => {
        if (!stopped) setResults(payload.results)
      })
      .catch((reason: unknown) => {
        if (!stopped) setError(reason instanceof Error ? reason.message : 'ค้นหาไม่สำเร็จ')
      })
    return () => {
      stopped = true
    }
  }, [query])

  return (
    <div data-testid="forum-search">
      <Crumb items={[{ label: 'Search' }]} />
      <form
        className="smf-form"
        onSubmit={(event) => {
          event.preventDefault()
          go(`/search?q=${encodeURIComponent(draft.trim())}`)
        }}
      >
        <div className="smf-cat">Search</div>
        <div className="smf-form-body">
          <label className="smf-field">
            <span>Words</span>
            <input className="smf-input" value={draft} aria-label="คำค้น" data-testid="search-query" onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit" className="smf-button">
            Search
          </button>
          {error ? <p className="smf-error">{error}</p> : null}
        </div>
      </form>
      <ul className="smf-search-list">
        {(results ?? []).map((result) => (
          <li key={result.topicId} className="windowbg">
            <ForumLink to={`/topic/${result.topicId}`}>{result.subject}</ForumLink>
            <div className="smf-small">
              {result.boardName} · <MemberName name={result.lastPosterName} color={result.lastPosterColor} /> · {smfDate(result.lastPostAt)}
            </div>
            <p>{result.snippet}</p>
          </li>
        ))}
      </ul>
      {results && results.length === 0 && query.trim().length >= 2 ? <p className="smf-note">ไม่พบกระทู้</p> : null}
    </div>
  )
}

export function HelpPage() {
  const { forumName } = useBranding()
  return (
    <div data-testid="forum-help">
      <Crumb items={[{ label: 'Help' }]} />
      <section className="smf-block">
        <div className="smf-cat">Help</div>
        <div className="smf-form-body smf-help">
          <p>{forumName} เป็นกระดานถาม-ตอบ เลือกบอร์ดแล้วกด New Topic เพื่อตั้งกระทู้ หรือเปิดกระทู้แล้วกด Reply</p>
          <p>แขกอ่านได้ทุกคน การโพสต์ต้องมีบัญชี ยกเว้นผู้ดูแลเปิด guest posting</p>
          <h3>BBCode</h3>
          <ul>
            <li>[b]ตัวหนา[/b]</li>
            <li>[i]ตัวเอียง[/i]</li>
            <li>[u]ขีดเส้น[/u]</li>
            <li>[quote author=ชื่อ date=วันที่]ข้อความ[/quote]</li>
            <li>[code]โค้ด[/code]</li>
            <li>[url=https://example.com]ลิงก์[/url]</li>
            <li>[img]https://example.com/image.png[/img]</li>
          </ul>
          <p>ผู้ดูแลปักหมุด ล็อก ย้าย ลบ และแก้กระทู้ได้ และสร้างหมวดกับบอร์ดจากปุ่ม Moderate ที่หน้าแรก</p>
        </div>
      </section>
    </div>
  )
}

export function AccountPage({ mode }: { mode: 'login' | 'profile' }) {
  return (
    <div data-testid={mode === 'profile' ? 'forum-profile' : 'forum-login'}>
      <Crumb items={[{ label: mode === 'profile' ? 'Profile' : 'Login' }]} />
      <section className="smf-block">
        <div className="smf-cat">{mode === 'profile' ? 'Profile' : 'Login / Register'}</div>
        <div className="smf-form-body">
          <AuthCard onSession={() => window.dispatchEvent(new Event('khuiwong-auth'))} />
          {mode === 'profile' ? <ProfileSettings /> : null}
        </div>
      </section>
    </div>
  )
}

function ProfileSettings() {
  const [me, setMe] = useState<ForumMe | null>(null)
  const [hex, setHex] = useState('#1d3a6e')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let stopped = false
    const load = () => {
      void forumGet<{ me: ForumMe }>('/api/forum/bootstrap')
        .then((payload) => {
          if (stopped) return
          setMe(payload.me)
          if (payload.me.nameColor) setHex(payload.me.nameColor)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener('khuiwong-auth', load)
    return () => {
      stopped = true
      window.removeEventListener('khuiwong-auth', load)
    }
  }, [])

  if (!me?.accountId) return null
  const picker = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#1d3a6e'

  async function saveColor() {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      const payload = await forumSend<{ me: ForumMe }>('/api/forum/name-color', 'PUT', { color: hex })
      setMe(payload.me)
      setNotice('บันทึกสีชื่อแล้ว')
      window.dispatchEvent(new Event('khuiwong-auth'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกสีไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return
    setError(null)
    setNotice(null)
    if (file.size > 2 * 1024 * 1024) {
      setError('รูปใหญ่เกิน 2 MB')
      return
    }
    setPending(true)
    try {
      const headers = new Headers()
      const token = sessionToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      headers.set('Content-Type', file.type || 'application/octet-stream')
      const response = await fetch('/api/account/avatar', { method: 'POST', body: file, headers })
      const data = (await response.json().catch(() => ({}))) as { message?: string; avatarUrl?: string }
      if (!response.ok) throw new Error(data.message || 'อัปโหลดรูปไม่สำเร็จ')
      setMe((current) => (current ? { ...current, avatarUrl: data.avatarUrl ?? current.avatarUrl } : current))
      setNotice('บันทึกรูปโปรไฟล์แล้ว')
      window.dispatchEvent(new Event('khuiwong-auth'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'อัปโหลดรูปไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="smf-profile" data-testid="profile-settings">
      {me.activity ? (
        <ActivityBlock
          activity={me.activity}
          posts={me.posts}
          staff={me.rank === 'owner' || me.rank === 'admin' || me.rank === 'moderator' ? me.rankLabel : null}
        />
      ) : null}
      <div className="smf-profile-avatar">
        {me.avatarUrl ? (
          <img className="smf-avatar" src={me.avatarUrl} alt="" width={80} height={80} data-testid="profile-avatar-preview" />
        ) : (
          <span className="smf-avatar smf-avatar-letter" data-testid="profile-avatar-preview">
            {(me.name[0] ?? '?').toUpperCase()}
          </span>
        )}
        <label className="smf-field">
          <span>Profile picture</span>
          <input
            className="smf-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="รูปโปรไฟล์"
            data-testid="profile-avatar-file"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void uploadAvatar(file)
            }}
          />
        </label>
        <p className="smf-small">jpg, png, webp หรือ gif ไม่เกิน 2 MB ระบบจะย่อเหลือ 128px</p>
      </div>
      <label className="smf-field">
        <span>Name color</span>
        <span className="smf-inline">
          <input
            type="color"
            value={picker}
            aria-label="ตัวเลือกสีชื่อ"
            data-testid="profile-color"
            onChange={(event) => setHex(event.target.value)}
          />
          <input
            className="smf-input"
            value={hex}
            maxLength={7}
            spellCheck={false}
            aria-label="รหัสสีชื่อ"
            data-testid="profile-color-hex"
            onChange={(event) => setHex(event.target.value)}
          />
          <span className="smf-author-name" style={{ color: inkColor(picker) }}>
            {me.name}
          </span>
        </span>
      </label>
      {me.colorLocked ? <p className="smf-small">ผู้ดูแลกำหนดสีชื่อไว้ สีที่เลือกจะถูกใช้เมื่อผู้ดูแลยกเลิก</p> : null}
      <div className="smf-form-actions">
        <button type="button" className="smf-button" data-testid="save-profile-color" disabled={pending} onClick={() => void saveColor()}>
          Save color
        </button>
      </div>
      {notice ? <p className="smf-small">{notice}</p> : null}
      {error ? (
        <p role="alert" className="smf-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
