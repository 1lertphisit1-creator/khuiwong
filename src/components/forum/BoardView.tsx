import { useEffect, useRef, useState } from 'react'
import { Composer } from '@/components/forum/Composer.tsx'
import { Crumb, ForumLink, MemberName, Pages } from '@/components/forum/parts.tsx'
import { forumGet, forumSend, onForum, smfDate, type BoardChoice, type ForumBoard, type ForumMe, type ForumTopic } from '@/lib/forum.ts'
import { go } from '@/lib/route.ts'

type Payload = {
  board: ForumBoard
  category: { id: number; name: string } | null
  stickies: ForumTopic[]
  topics: ForumTopic[]
  page: number
  pages: number
  me: ForumMe
  boards: BoardChoice[]
}

export function BoardView({ id, page }: { id: number; page: number }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loadGen = useRef(0)

  function load() {
    const ticket = ++loadGen.current
    return forumGet<Payload>(`/api/forum/boards/${id}?page=${page}`)
      .then((payload) => {
        if (ticket !== loadGen.current) return
        setData(payload)
        setError(null)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'โหลดบอร์ดไม่สำเร็จ')
      })
  }

  useEffect(() => {
    void load()
    return onForum((event) => {
      if (event.type === 'online') return
      if (event.type === 'boards') {
        void load()
        return
      }
      if (event.boardId === id || (event.type === 'topic' && event.fromBoardId === id)) void load()
    })
  }, [id, page])

  async function createTopic(value: { subject?: string; body: string; guestName?: string }) {
    setBusy(true)
    setFormError(null)
    try {
      const result = await forumSend<{ topicId: number }>(`/api/forum/boards/${id}/topics`, 'POST', value)
      go(`/topic/${result.topicId}`)
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'ตั้งกระทู้ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <p className="smf-error">{error}</p>
  if (!data) return <p className="smf-small">Loading…</p>
  const rows = [...data.stickies, ...data.topics]
  const pageHref = (next: number) => `/board/${id}?page=${next}`

  return (
    <div data-testid="forum-board">
      <Crumb items={[{ label: data.category?.name ?? 'Board', href: '/' }, { label: data.board.name }]} />
      <div className="smf-index-tools">
        {data.me.canPost ? (
          <a className="smf-button" href="#new-topic-form" data-testid="new-topic">
            New Topic
          </a>
        ) : (
          <ForumLink to="/login" className="smf-button" testId="new-topic">
            New Topic
          </ForumLink>
        )}
        <Pages page={data.page} pages={data.pages} href={pageHref} />
      </div>
      <p className="smf-small">{data.board.description}</p>
      <table className="smf-table">
        <thead>
          <tr className="smf-title">
            <th />
            <th>Subject</th>
            <th>Started by</th>
            <th>Replies</th>
            <th>Views</th>
            <th>Last post</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="windowbg">
              <td colSpan={6}>No topics yet.</td>
            </tr>
          ) : (
            rows.map((topic, index) => <TopicRow key={topic.id} topic={topic} stripe={index % 2 === 0} />)
          )}
        </tbody>
      </table>
      <div className="smf-index-tools">
        {data.me.canPost ? (
          <a className="smf-button" href="#new-topic-form">
            New Topic
          </a>
        ) : (
          <ForumLink to="/login" className="smf-button">
            New Topic
          </ForumLink>
        )}
        <Pages page={data.page} pages={data.pages} href={pageHref} />
      </div>
      {data.me.canPost ? (
        <Composer mode="topic" guest={!data.me.accountId} busy={busy} error={formError} onSubmit={(value) => void createTopic(value)} />
      ) : (
        <p className="smf-note">
          {data.me.postBlock ?? 'เข้าสู่ระบบก่อนโพสต์'} <ForumLink to="/login">Login</ForumLink>
        </p>
      )}
    </div>
  )
}

function TopicRow({ topic, stripe }: { topic: ForumTopic; stripe: boolean }) {
  const page = Math.max(1, Math.ceil((topic.replies + 1) / 15))
  return (
    <tr className={stripe ? 'windowbg' : 'windowbg2'} data-testid="forum-topic-row">
      <td className="smf-icon-cell">
        <TopicIcon sticky={topic.sticky} locked={topic.locked} />
      </td>
      <td>
        {topic.sticky ? <span className="smf-flag">Sticky</span> : null}
        {topic.locked ? <span className="smf-flag">Locked</span> : null}
        <ForumLink to={`/topic/${topic.id}`} className="smf-board-name">
          {topic.subject}
        </ForumLink>
      </td>
      <td>
        <MemberName name={topic.authorName} color={topic.authorColor} />
      </td>
      <td className="smf-count">{topic.replies}</td>
      <td className="smf-count">{topic.views}</td>
      <td className="smf-last">
        Last post by <MemberName name={topic.lastPosterName} color={topic.lastPosterColor} />
        <br />
        on {smfDate(topic.lastPostAt)}
        <br />
        <ForumLink to={`/topic/${topic.id}?page=${page}`} className="smf-small">
          last
        </ForumLink>
      </td>
    </tr>
  )
}

function TopicIcon({ sticky, locked }: { sticky: boolean; locked: boolean }) {
  const label = locked ? 'Locked' : sticky ? 'Sticky' : 'Topic'
  return (
    <span className={`smf-topic-icon${locked ? ' is-locked' : ''}${sticky ? ' is-sticky' : ''}`} title={label} aria-label={label}>
      {locked ? '▣' : sticky ? '★' : '▢'}
    </span>
  )
}
