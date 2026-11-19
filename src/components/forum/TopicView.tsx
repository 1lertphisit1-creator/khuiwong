import { useEffect, useRef, useState } from 'react'
import { Composer, type ComposerHandle } from '@/components/forum/Composer.tsx'
import { BbcodeBody, Crumb, ForumLink, Pages } from '@/components/forum/parts.tsx'
import { ActivityBlock } from '@/components/forum/Ranks.tsx'
import {
  forumGet,
  forumSend,
  inkColor,
  onForum,
  smfDate,
  type BoardChoice,
  type ForumMe,
  type ForumPost,
  type ForumTopic,
} from '@/lib/forum.ts'
import { go } from '@/lib/route.ts'

type Payload = {
  topic: ForumTopic
  board: { id: number; name: string; description: string } | null
  category: { id: number; name: string } | null
  posts: ForumPost[]
  page: number
  pages: number
  me: ForumMe
  boards: BoardChoice[]
}

export function TopicView({ id, page }: { id: number; page: number }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [moveTo, setMoveTo] = useState(0)
  const composer = useRef<ComposerHandle>(null)
  const boardRef = useRef<number | null>(null)
  const loadGen = useRef(0)

  function load() {
    const ticket = ++loadGen.current
    return forumGet<Payload>(`/api/forum/topics/${id}?page=${page}`)
      .then((payload) => {
        if (ticket !== loadGen.current) return
        boardRef.current = payload.board?.id ?? null
        setData(payload)
        setMoveTo(payload.topic.boardId)
        setError(null)
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'โหลดกระทู้ไม่สำเร็จ')
      })
  }

  useEffect(() => {
    void load()
    void forumSend(`/api/forum/topics/${id}/view`, 'POST').catch(() => {})
    return onForum((event) => {
      if (event.type === 'topic' && event.topicId === id && event.deleted) {
        go(boardRef.current ? `/board/${boardRef.current}` : '/')
        return
      }
      if (event.type === 'post' && event.topicId === id) {
        setData((current) => {
          if (!current || current.page !== current.pages) return current
          if (current.posts.some((post) => post.id === event.post.id)) return current
          return { ...current, posts: [...current.posts, event.post] }
        })
      }
      if ((event.type === 'topic' || event.type === 'post') && event.topicId === id) void load()
      if (event.type === 'boards') void load()
    })
  }, [id, page])

  async function reply(value: { body: string; guestName?: string }) {
    setBusy(true)
    setFormError(null)
    try {
      const result = await forumSend<{ page: number }>(`/api/forum/topics/${id}/replies`, 'POST', value)
      if (result.page !== page) go(`/topic/${id}?page=${result.page}`)
      else await load()
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'ตอบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function moderate(body: Record<string, unknown>) {
    if (!data) return
    try {
      const result = await forumSend<{ deleted?: boolean }>(`/api/forum/topics/${id}/moderate`, 'POST', body)
      if (result.deleted) go(`/board/${data.topic.boardId}`)
      else await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'จัดการกระทู้ไม่สำเร็จ')
    }
  }

  if (error && !data) return <p className="smf-error">{error}</p>
  if (!data?.board) return <p className="smf-small">Loading…</p>
  const pageHref = (next: number) => `/topic/${id}?page=${next}`
  const firstId = data.posts[0]?.id

  return (
    <div data-testid="forum-topic">
      <Crumb
        items={[
          { label: data.category?.name ?? 'Board', href: '/' },
          { label: data.board.name, href: `/board/${data.board.id}` },
          { label: data.topic.subject },
        ]}
      />
      <div className="smf-index-tools">
        <a className="smf-button" href="#reply-form" data-testid="reply">
          Reply
        </a>
        <Pages page={data.page} pages={data.pages} href={pageHref} />
      </div>
      <h2 className="smf-topic-title">
        {data.topic.sticky ? <span className="smf-flag">Sticky</span> : null}
        {data.topic.locked ? <span className="smf-flag">Locked</span> : null}
        {data.topic.subject}
      </h2>
      {data.topic.locked ? <p className="smf-note">This topic is locked.</p> : null}
      {data.me.canModerate ? (
        <div className="smf-modbar" data-testid="topic-mod">
          <button type="button" className="smf-button smf-button-alt" onClick={() => void moderate({ sticky: !data.topic.sticky })}>
            {data.topic.sticky ? 'Unsticky' : 'Sticky'}
          </button>
          <button type="button" className="smf-button smf-button-alt" onClick={() => void moderate({ locked: !data.topic.locked })}>
            {data.topic.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            type="button"
            className="smf-button smf-button-alt"
            onClick={() => {
              if (window.confirm('ลบกระทู้นี้?')) void moderate({ delete: true })
            }}
          >
            Delete
          </button>
          <label className="smf-inline">
            <span className="smf-small">Move</span>
            <select className="smf-input" value={moveTo} aria-label="ย้ายไปบอร์ด" onChange={(event) => setMoveTo(Number(event.target.value))}>
              {data.boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.category}: {board.name}
                </option>
              ))}
            </select>
            <button type="button" className="smf-button" onClick={() => void moderate({ boardId: moveTo })}>
              Move
            </button>
          </label>
        </div>
      ) : null}
      <div className="smf-posts">
        {data.posts.map((post, index) => (
          <PostBit
            key={post.id}
            post={post}
            subject={post.id === firstId && data.page === 1 ? data.topic.subject : `Re: ${data.topic.subject}`}
            stripe={index % 2 === 0}
            me={data.me}
            onQuote={() => {
              composer.current?.insert(quoteOf(post))
              document.getElementById('reply-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            onChanged={() => void load()}
          />
        ))}
      </div>
      <div className="smf-index-tools">
        <a className="smf-button" href="#reply-form">
          Reply
        </a>
        <Pages page={data.page} pages={data.pages} href={pageHref} />
      </div>
      {data.me.canPost && (!data.topic.locked || data.me.canModerate) ? (
        <Composer ref={composer} mode="reply" guest={!data.me.accountId} busy={busy} error={formError} onSubmit={(value) => void reply(value)} />
      ) : (
        <p className="smf-note">
          {data.topic.locked ? 'กระทู้นี้ถูกล็อก' : (data.me.postBlock ?? 'เข้าสู่ระบบก่อนโพสต์')}{' '}
          {data.me.accountId ? null : <ForumLink to="/login">Login</ForumLink>}
        </p>
      )}
      {error ? <p className="smf-error">{error}</p> : null}
    </div>
  )
}

function PostBit({
  post,
  subject,
  stripe,
  me,
  onQuote,
  onChanged,
}: {
  post: ForumPost
  subject: string
  stripe: boolean
  me: ForumMe
  onQuote: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(post.body)
  const [title, setTitle] = useState(subject.replace(/^Re: /, ''))
  const [error, setError] = useState<string | null>(null)
  const owns = Boolean(me.accountId && me.accountId === post.author.accountId)
  const canEdit = owns || me.canModerate
  const color = inkColor(post.author.color)

  async function save() {
    setError(null)
    try {
      await forumSend(`/api/forum/posts/${post.id}`, 'PUT', {
        body,
        subject: subject.startsWith('Re:') ? undefined : title,
      })
      setEditing(false)
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function remove() {
    if (!window.confirm('ลบข้อความนี้?')) return
    try {
      await forumSend(`/api/forum/posts/${post.id}`, 'DELETE')
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ลบไม่สำเร็จ')
    }
  }

  return (
    <article className={`smf-post ${stripe ? 'windowbg' : 'windowbg2'}`} data-testid="forum-post">
      <div className="smf-author">
        <div className="smf-author-name" style={{ color }}>
          {post.author.name}
        </div>
        {post.author.activity ? (
          <ActivityBlock
            activity={post.author.activity}
            posts={post.author.posts}
            staff={post.author.rank === 'owner' || post.author.rank === 'admin' || post.author.rank === 'moderator' ? post.author.rankLabel : null}
          />
        ) : (
          <div className="smf-rank">{post.author.rankLabel}</div>
        )}
        {post.author.avatarUrl ? (
          <img className="smf-avatar" src={post.author.avatarUrl} alt="" width={80} height={80} />
        ) : (
          <span className="smf-avatar smf-avatar-letter" aria-hidden="true">
            {(post.author.name[0] ?? '?').toUpperCase()}
          </span>
        )}
      </div>
      <div className="smf-post-main">
        <div className="smf-post-head">
          <strong>{subject}</strong>
          <span className="smf-post-actions">
            <button type="button" className="smf-text-btn" data-testid="post-quote" onClick={onQuote}>
              Quote
            </button>
            {canEdit ? (
              <button type="button" className="smf-text-btn" onClick={() => setEditing((value) => !value)}>
                {editing ? 'Cancel' : 'Edit'}
              </button>
            ) : null}
            {me.canModerate ? (
              <button type="button" className="smf-text-btn" onClick={() => void remove()}>
                Delete
              </button>
            ) : null}
          </span>
        </div>
        <div className="smf-small">
          <b>on:</b> {smfDate(post.createdAt)}
          {post.updatedAt ? ` · edited ${smfDate(post.updatedAt)}` : ''}
        </div>
        {editing ? (
          <div className="smf-edit">
            {subject.startsWith('Re:') ? null : (
              <input className="smf-input" value={title} aria-label="หัวข้อ" onChange={(event) => setTitle(event.target.value)} />
            )}
            <textarea className="smf-area" value={body} aria-label="แก้ไขข้อความ" onChange={(event) => setBody(event.target.value)} />
            <button type="button" className="smf-button" onClick={() => void save()}>
              Save
            </button>
          </div>
        ) : (
          <BbcodeBody className="smf-post-text" text={post.body} />
        )}
        {post.author.signature ? <BbcodeBody className="signature" text={post.author.signature} /> : null}
        {error ? <p className="smf-error">{error}</p> : null}
      </div>
    </article>
  )
}

function quoteOf(post: ForumPost) {
  const name = post.author.name.replaceAll('[', '').replaceAll(']', '')
  return `[quote author=${name} date=${smfDate(post.createdAt)}]\n${post.body}\n[/quote]\n`
}
