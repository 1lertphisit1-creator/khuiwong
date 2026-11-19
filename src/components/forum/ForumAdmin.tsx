import { useEffect, useState } from 'react'
import { Crumb } from '@/components/forum/parts.tsx'
import { go } from '@/lib/route.ts'
import { AppointRank } from '@/components/forum/Ranks.tsx'
import { AdAdmin } from '@/components/forum/SiteExtras.tsx'
import {
  forumGet,
  forumSend,
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

export function ForumAdminPage() {
  const [data, setData] = useState<IndexPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      setData(await forumGet<IndexPayload>('/api/forum'))
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'โหลดไม่สำเร็จ')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (error) return <p className="smf-error">{error}</p>
  if (!data) return <p className="smf-small">Loading…</p>
  if (!data.me.canModerate) {
    return (
      <div data-testid="forum-admin-denied">
        <Crumb items={[{ label: 'Admin' }]} />
        <p className="smf-note">เฉพาะผู้ดูแล</p>
      </div>
    )
  }
  return (
    <div data-testid="forum-admin-page">
      <Crumb items={[{ label: 'Admin' }]} />
      <AdminBox
        categories={data.categories}
        guestPosting={data.me.guestPosting}
        branding={data.branding}
        canRename={data.me.canRename}
        canAppoint={data.me.rank === 'owner' || data.me.rank === 'admin'}
        onChanged={() => void load()}
      />
    </div>
  )
}

function AdminBox({
  categories,
  guestPosting,
  branding,
  canRename,
  canAppoint,
  onChanged,
}: {
  categories: ForumCategory[]
  guestPosting: boolean
  branding: ForumBranding
  canRename: boolean
  canAppoint: boolean
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
        <a className="smf-button smf-ad-manage" href="/admin/ads" data-testid="open-ad-admin" onClick={(event) => {
          event.preventDefault()
          go('/admin/ads')
        }}>
          จัดการป้ายโฆษณา
        </a>
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
        {canRename ? <NameSettings branding={branding} run={run} /> : null}
        {canRename ? <AdAdmin /> : null}
        {canAppoint ? <AppointRank /> : null}
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

function NameSettings({ branding, run }: { branding: ForumBranding; run: (task: () => Promise<unknown>) => Promise<void> }) {
  const [siteName, setSiteName] = useState(branding.siteName)
  const [forumName, setForumName] = useState(branding.forumName)
  const stamp = `${branding.siteName}|${branding.forumName}`
  const [seen, setSeen] = useState(stamp)
  if (stamp !== seen) {
    setSeen(stamp)
    setSiteName(branding.siteName)
    setForumName(branding.forumName)
  }

  return (
    <form
      className="smf-inline"
      onSubmit={(event) => {
        event.preventDefault()
        void run(() => forumSend('/api/forum/settings', 'PUT', { siteName, forumName }))
      }}
    >
      <label className="smf-field">
        <span>Site name</span>
        <input className="smf-input" value={siteName} maxLength={40} aria-label="ชื่อเว็บ" data-testid="site-name" onChange={(event) => setSiteName(event.target.value)} />
      </label>
      <label className="smf-field">
        <span>Forum name</span>
        <input className="smf-input" value={forumName} maxLength={40} aria-label="ชื่อฟอรัม" data-testid="forum-name" onChange={(event) => setForumName(event.target.value)} />
      </label>
      <button type="submit" className="smf-button" data-testid="save-names">
        Save names
      </button>
    </form>
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
