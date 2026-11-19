import { useEffect, useRef, useState } from 'react'
import { Crumb, ForumLink, MemberName } from '@/components/forum/parts.tsx'
import {
  forumGet,
  onForum,
  smfDate,
  type ForumBoard,
  type ForumCategory,
  type ForumBranding,
  type ForumMe,
  type ForumStats,
} from '@/lib/forum.ts'

type IndexPayload = {
  categories: ForumCategory[]
  me: ForumMe
  stats: ForumStats
  branding: ForumBranding
}

export function BoardIndex() {
  const [data, setData] = useState<IndexPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
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
            Last post by <MemberName name={board.lastPost.name} color={board.lastPost.color} />
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
