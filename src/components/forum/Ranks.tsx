import { useEffect, useState } from 'react'
import { Crumb } from '@/components/forum/parts.tsx'
import { forumGet, forumSend, type ActivityKind, type ActivityView, type ForumMe } from '@/lib/forum.ts'

type RankRow = {
  id: string
  threshold: number
  title: string
  nickname: string
  kind: ActivityKind
  marks: number
}

export function Insignia({ kind, marks, title }: { kind: ActivityKind; marks: number; title: string }) {
  const board = kind === 'star' ? '#8c1d24' : kind === 'plain' || kind === 'chevron' ? '#243628' : '#1c2840'
  const edge = kind === 'star' ? '#e0b84a' : '#c5a15a'
  return (
    <svg className="smf-insignia" viewBox="0 0 96 36" role="img" aria-label={title} data-testid="activity-insignia">
      <rect x="1" y="1" width="94" height="34" rx="4" fill={board} stroke={edge} strokeWidth="2" />
      {kind === 'chevron' ? <Chevrons marks={marks} /> : null}
      {kind === 'pip' ? <Pips marks={marks} /> : null}
      {kind === 'flower' ? <Flowers marks={marks} /> : null}
      {kind === 'star' ? <Stars marks={marks} /> : null}
    </svg>
  )
}

export function ActivityBlock({ activity, posts, staff }: { activity: ActivityView | null; posts: number; staff?: string | null }) {
  if (!activity) return null
  return (
    <div className="smf-activity" data-testid="activity-rank">
      {staff ? <div className="smf-staff-badge">{staff}</div> : null}
      <div className="smf-activity-title">{activity.title}</div>
      <div className="smf-activity-nick">"{activity.nickname}"</div>
      <Insignia kind={activity.kind} marks={activity.marks} title={activity.title} />
      <div className="smf-small">โพสต์ {posts.toLocaleString('en-US')}</div>
    </div>
  )
}

export function PromotionNotice({
  promotion,
  onDone,
}: {
  promotion: { title: string; nickname: string }
  onDone: () => void
}) {
  return (
    <div className="smf-promotion" data-testid="promotion-notice" role="status">
      <span>
        ได้รับแต่งตั้งเป็น {promotion.title} "{promotion.nickname}"
      </span>
      <button type="button" className="smf-button" onClick={onDone}>
        รับทราบ
      </button>
    </div>
  )
}

export function RanksPage() {
  const [ranks, setRanks] = useState<RankRow[] | null>(null)
  const [mine, setMine] = useState<string | null>(null)

  useEffect(() => {
    void forumGet<{ ranks: RankRow[] }>('/api/forum/ranks').then((payload) => setRanks(payload.ranks))
    void forumGet<{ me: ForumMe }>('/api/forum/bootstrap')
      .then((payload) => setMine(payload.me.activity?.id ?? null))
      .catch(() => {})
  }, [])

  return (
    <div data-testid="ranks-page">
      <Crumb items={[{ label: 'ยศทั้งหมด' }]} />
      <section className="smf-block">
        <div className="smf-cat">ยศทั้งหมด</div>
        <p className="smf-form-body smf-small">ยศเลื่อนตามจำนวนโพสต์ ทั้งตั้งกระทู้และตอบกระทู้ ผู้ดูแลแต่งตั้งยศให้ได้</p>
        <ul className="smf-rank-list">
          {(ranks ?? []).map((rank) => (
            <li key={rank.id} className={rank.id === mine ? 'is-mine' : ''} data-testid={`rank-${rank.id}`}>
              <Insignia kind={rank.kind} marks={rank.marks} title={rank.title} />
              <div>
                <strong>{rank.title}</strong>
                <div className="smf-activity-nick">"{rank.nickname}"</div>
                <div className="smf-small">{rank.threshold.toLocaleString('en-US')} โพสต์</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function AppointRank() {
  const [ranks, setRanks] = useState<RankRow[]>([])
  const [nickname, setNickname] = useState('')
  const [rank, setRank] = useState('private')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void forumGet<{ ranks: RankRow[] }>('/api/forum/ranks').then((payload) => setRanks(payload.ranks))
  }, [])

  async function save(next: string | null) {
    setError(null)
    setMessage(null)
    try {
      await forumSend('/api/forum/activity-rank', 'PUT', { nickname, rank: next })
      setMessage(next ? `แต่งตั้ง ${nickname} แล้ว` : `ยกเลิกยศที่แต่งตั้งของ ${nickname} แล้ว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'แต่งตั้งไม่สำเร็จ')
    }
  }

  return (
    <form
      className="smf-admin-cat"
      data-testid="appoint-rank"
      onSubmit={(event) => {
        event.preventDefault()
        void save(rank)
      }}
    >
      <p className="smf-small">แต่งตั้งยศ ทับยศที่คำนวณจากจำนวนโพสต์ จนกว่าจะยกเลิก</p>
      <div className="smf-inline">
        <input className="smf-input" value={nickname} placeholder="ชื่อสมาชิก" aria-label="ชื่อสมาชิกที่จะแต่งตั้ง" data-testid="appoint-name" onChange={(event) => setNickname(event.target.value)} />
        <select className="smf-input" value={rank} aria-label="ยศที่แต่งตั้ง" data-testid="appoint-select" onChange={(event) => setRank(event.target.value)}>
          {ranks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <button type="submit" className="smf-button">
          แต่งตั้ง
        </button>
        <button type="button" className="smf-button smf-button-alt" onClick={() => void save(null)}>
          ยกเลิกแต่งตั้ง
        </button>
      </div>
      {message ? <p className="smf-small">{message}</p> : null}
      {error ? <p className="smf-error">{error}</p> : null}
    </form>
  )
}

function Chevrons({ marks }: { marks: number }) {
  const count = Math.min(3, marks)
  const start = 20 - (count - 1) * 5
  return (
    <g fill="none" stroke="#e0b84a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {Array.from({ length: count }, (_, index) => {
        const y = start + index * 7
        return <path key={y} d={`M 34 ${y} L 48 ${y + 6} L 62 ${y}`} />
      })}
      {marks >= 4 ? <path d="M 34 30 Q 48 35 62 30" /> : null}
    </g>
  )
}

function Pips({ marks }: { marks: number }) {
  return (
    <g>
      {centers(marks).map((x) => (
        <Star key={x} cx={x} cy={18} r={5} />
      ))}
    </g>
  )
}

function Flowers({ marks }: { marks: number }) {
  return (
    <g fill="#e0b84a">
      {centers(marks).map((x) => (
        <g key={x}>
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180
            return <circle key={angle} cx={x + Math.cos(rad) * 3.2} cy={18 + Math.sin(rad) * 3.2} r="2.1" />
          })}
          <circle cx={x} cy={18} r="2" fill="#8c1d24" />
        </g>
      ))}
    </g>
  )
}

function Stars({ marks }: { marks: number }) {
  return (
    <g>
      {centers(marks).map((x) => (
        <Star key={x} cx={x} cy={18} r={marks > 3 ? 4.2 : 5.2} />
      ))}
    </g>
  )
}

function Star({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? r : r * 0.42
    const angle = (Math.PI / 5) * index - Math.PI / 2
    return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`
  }).join(' ')
  return <polygon points={points} fill="#e0b84a" />
}

function centers(count: number) {
  const gap = count > 3 ? 16 : 18
  const width = (count - 1) * gap
  const start = 48 - width / 2
  return Array.from({ length: count }, (_, index) => start + index * gap)
}
