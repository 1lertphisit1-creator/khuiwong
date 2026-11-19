import { useEffect, useState } from 'react'
import { AuthCard } from '@/components/AuthCard.tsx'
import { useBranding } from '@/components/forum/branding.tsx'
import { Crumb, ForumLink } from '@/components/forum/parts.tsx'
import { forumGet, smfDate } from '@/lib/forum.ts'
import { go } from '@/lib/route.ts'

type SearchResult = {
  topicId: number
  subject: string
  boardId: number
  boardName: string
  lastPostAt: number
  lastPosterName: string
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
              {result.boardName} · {result.lastPosterName} · {smfDate(result.lastPostAt)}
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
        <AuthCard onSession={() => window.dispatchEvent(new Event('khuiwong-auth'))} />
      </section>
    </div>
  )
}
