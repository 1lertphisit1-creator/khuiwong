import { useEffect, useRef, useState } from 'react'
import { Crumb, ForumLink } from '@/components/forum/parts.tsx'
import {
  forumGet,
  forumSend,
  onForum,
  smfDate,
  type ForumBoard,
  type ForumCategory,
  type ForumMe,
  type ForumStats,
} from '@/lib/forum.ts'

type IndexPayload = {
  categories: ForumCategory[]
  me: ForumMe
  stats: ForumStats
}

export function BoardIndex() {
  const [data, setData] = useState<IndexPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moderate, setModerate] = useState(false)
  const loadGen = useRef(0)

  async function load() {
    const ticket = ++loadGen.current
    try {
      const payload = await forumGet<IndexPayload>('/api/forum')
      if (ticket !== loadGen.current) return
      setData(payload)
      setError(null)
    } catch (reason) {
      if (ticket !== loadGen.current) return
      setError(reason instanceof Error ? reason.message : 'โหลดบอร์ดไม่สำเร็จ')
    }
  }

  useEffect(() => {
    void load()
    return onForum((event) => {
      if (event.type === 'online') return
      void load()
    })
  }, [])

  if (error) return <p className="smf-error">{error}</p>
  if (!data) return <p className="smf-small">Loading…</p>
  const bitcoin = data.categories.flatMap((category) => category.boards).find((board) => board.name === 'Bitcoin Discussion')

  return (
    <div data-testid="forum-index">
      <Crumb items={[{ label: 'Board index' }]} />
      <div className="smf-index-tools">
        {bitcoin ? (
          <ForumLink to={`/board/${bitcoin.id}`} className="smf-button">
            Bitcoin Discussion
          </ForumLink>
        ) : null}
        {data.me.canModerate ? (
          <button type="button" className="smf-button smf-button-alt" data-testid="toggle-moderate" onClick={() => setModerate((value) => !value)}>
            {moderate ? 'Hide admin' : 'Moderate'}
          </button>
        ) : null}
      </div>
      {data.categories.map((category) => (
        <section key={category.id} className="smf-block" data-testid="forum-category">
          <div className="smf-cat">{category.name}</div>
          <table className="smf-table">
            <thead>
              <tr className="smf-title">
                <th />
                <th>Board</th>
                <th>Topics</th>
                <th>Posts</th>
                <th>Last post</th>
              </tr>
            </thead>
            <tbody>
              {category.boards.map((board, index) => (
                <BoardRow key={board.id} board={board} stripe={index % 2 === 0} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {moderate && data.me.canModerate ? <AdminBox categories={data.categories} guestPosting={data.me.guestPosting} onChanged={() => void load()} /> : null}
    </div>
  )
}

function BoardRow({ board, stripe }: { board: ForumBoard; stripe: boolean }) {
  return (
    <tr className={stripe ? 'windowbg' : 'windowbg2'} data-testid="forum-board-row">
      <td className="smf-icon-cell">
        <span className="smf-folder" aria-hidden="true" />
      </td>
      <td>
        <ForumLink to={`/board/${board.id}`} className="smf-board-name" testId={`board-link-${board.id}`}>
          {board.name}
        </ForumLink>
        <div className="smf-small">{board.description}</div>
      </td>
      <td className="smf-count">{board.topics}</td>
      <td className="smf-count">{board.posts}</td>
      <td className="smf-last">
        {board.lastPost ? (
          <>
            Last post by {board.lastPost.name}
            <br />
            on {smfDate(board.lastPost.at)}
            <br />
            <ForumLink to={`/topic/${board.lastPost.topicId}?page=${board.lastPost.page}`} className="smf-small">
              {board.lastPost.subject}
            </ForumLink>
          </>
        ) : (
          <span className="smf-small">No posts</span>
        )}
      </td>
    </tr>
  )
}

function AdminBox({
  categories,
  guestPosting,
  onChanged,
}: {
  categories: ForumCategory[]
  guestPosting: boolean
  onChanged: () => void
}) {
  const [categoryName, setCategoryName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guestOn, setGuestOn] = useState(guestPosting)
  const [seenGuest, setSeenGuest] = useState(guestPosting)
  if (guestPosting !== seenGuest) {
    setSeenGuest(guestPosting)
    setGuestOn(guestPosting)
  }

  async function run(task: () => Promise<unknown>) {
    setError(null)
    try {
      await task()
      onChanged()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'บันทึกไม่สำเร็จ')
    }
  }

  return (
    <section className="smf-block" data-testid="forum-admin">
      <div className="smf-cat">Forum admin</div>
      <div className="smf-form-body">
        <label className="smf-check">
          <input
            type="checkbox"
            data-testid="guest-posting"
            checked={guestOn}
            onChange={(event) => {
              const next = event.target.checked
              setGuestOn(next)
              void run(async () => {
                try {
                  await forumSend('/api/forum/settings', 'PUT', { guestPosting: next })
                } catch (reason) {
                  setGuestOn(!next)
                  throw reason
                }
              })
            }}
          />
          Allow guests to post
        </label>
        <form
          className="smf-inline"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await forumSend('/api/forum/categories', 'POST', { name: categoryName })
              setCategoryName('')
            })
          }}
        >
          <input className="smf-input" value={categoryName} aria-label="ชื่อหมวดใหม่" placeholder="New category" onChange={(event) => setCategoryName(event.target.value)} />
          <button type="submit" className="smf-button">
            Add category
          </button>
        </form>
        {categories.map((category) => (
          <CategoryAdmin key={category.id} category={category} categories={categories} run={run} />
        ))}
        {error ? <p className="smf-error">{error}</p> : null}
      </div>
    </section>
  )
}

function CategoryAdmin({
  category,
  categories,
  run,
}: {
  category: ForumCategory
  categories: ForumCategory[]
  run: (task: () => Promise<unknown>) => Promise<void>
}) {
  const [name, setName] = useState(category.name)
  const [boardName, setBoardName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="smf-admin-cat">
      <div className="smf-inline">
        <input className="smf-input" value={name} aria-label={`ชื่อหมวด ${category.name}`} onChange={(event) => setName(event.target.value)} />
        <button type="button" className="smf-button" onClick={() => void run(() => forumSend(`/api/forum/categories/${category.id}`, 'PUT', { name }))}>
          Save
        </button>
        <button
          type="button"
          className="smf-button smf-button-alt"
          onClick={() => void run(() => forumSend(`/api/forum/categories/${category.id}`, 'DELETE'))}
        >
          Delete
        </button>
      </div>
      {category.boards.map((board) => (
        <BoardAdmin key={board.id} board={board} categories={categories} run={run} />
      ))}
      <form
        className="smf-inline"
        onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await forumSend('/api/forum/boards', 'POST', { categoryId: category.id, name: boardName, description })
            setBoardName('')
            setDescription('')
          })
        }}
      >
        <input className="smf-input" value={boardName} aria-label={`บอร์ดใหม่ใน ${category.name}`} placeholder="New board" onChange={(event) => setBoardName(event.target.value)} />
        <input className="smf-input" value={description} aria-label="คำอธิบายบอร์ด" placeholder="Description" onChange={(event) => setDescription(event.target.value)} />
        <button type="submit" className="smf-button">
          Add board
        </button>
      </form>
    </div>
  )
}

function BoardAdmin({
  board,
  categories,
  run,
}: {
  board: ForumBoard
  categories: ForumCategory[]
  run: (task: () => Promise<unknown>) => Promise<void>
}) {
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description)
  const [categoryId, setCategoryId] = useState(board.categoryId)

  return (
    <div className="smf-inline">
      <input className="smf-input" value={name} aria-label={`ชื่อบอร์ด ${board.name}`} onChange={(event) => setName(event.target.value)} />
      <input className="smf-input" value={description} aria-label={`คำอธิบาย ${board.name}`} onChange={(event) => setDescription(event.target.value)} />
      <select className="smf-input" value={categoryId} aria-label={`หมวดของ ${board.name}`} onChange={(event) => setCategoryId(Number(event.target.value))}>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="smf-button"
        onClick={() => void run(() => forumSend(`/api/forum/boards/${board.id}`, 'PUT', { name, description, categoryId }))}
      >
        Save board
      </button>
      <button
        type="button"
        className="smf-button smf-button-alt"
        onClick={() => {
          if (window.confirm(`ลบบอร์ด ${board.name} และกระทู้ทั้งหมด?`)) {
            void run(() => forumSend(`/api/forum/boards/${board.id}`, 'DELETE'))
          }
        }}
      >
        Delete board
      </button>
    </div>
  )
}
