import { useEffect, useState } from 'react'
import { forumGet, forumSend } from '@/lib/forum.ts'
import type { AppRoute } from '@/lib/route.ts'

type ViewTotals = { total: number; today: number }
type AdSlot = { slot: number; imageUrl: string; linkUrl: string; alt: string }

const LINE_URL = 'https://line.me/ti/p/~fibo99'

export function VisitCounter({ route, online }: { route: AppRoute; online: number | null }) {
  const [views, setViews] = useState<ViewTotals | null>(null)
  const routeKey = `${route.name}:${'id' in route ? route.id : ''}:${'page' in route ? route.page : ''}:${'query' in route ? route.query : ''}:${'code' in route ? route.code : ''}`

  useEffect(() => {
    let stopped = false
    const visitor = visitorId()
    const path = `${window.location.pathname}${window.location.search}`
    void fetch('/api/forum/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor, path }),
    })
      .then((response) => (response.ok ? (response.json() as Promise<ViewTotals>) : null))
      .then((payload) => {
        if (!stopped && payload && Number.isFinite(payload.total)) setViews(payload)
      })
      .catch(() => {})
    return () => {
      stopped = true
    }
  }, [routeKey])

  return (
    <div className="smf-counter" data-testid="visit-counter">
      <span>
        เข้าชมทั้งหมด <strong data-testid="visit-total">{views ? views.total.toLocaleString('en-US') : '…'}</strong>
      </span>
      <span>
        วันนี้ <strong data-testid="visit-today">{views ? views.today.toLocaleString('en-US') : '…'}</strong>
      </span>
      <span>
        ออนไลน์ <strong data-testid="visit-online">{online == null ? '…' : online.toLocaleString('en-US')}</strong>
      </span>
    </div>
  )
}

export function AdSlots() {
  const [slots, setSlots] = useState<AdSlot[] | null>(null)

  useEffect(() => {
    let stopped = false
    void forumGet<{ slots: AdSlot[] }>('/api/forum/ads')
      .then((payload) => {
        if (!stopped) setSlots(payload.slots)
      })
      .catch(() => {})
    return () => {
      stopped = true
    }
  }, [])

  return (
    <section className="smf-ads" data-testid="ad-slots" aria-label="โฆษณา">
      {(slots ?? emptySlots()).map((slot) => (
        <AdCard key={slot.slot} slot={slot} />
      ))}
    </section>
  )
}

export function AdAdmin() {
  const [slots, setSlots] = useState<AdSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<number | null>(null)

  useEffect(() => {
    void forumGet<{ slots: AdSlot[] }>('/api/forum/ads')
      .then((payload) => setSlots(payload.slots))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'โหลดป้ายไม่สำเร็จ'))
  }, [])

  if (!slots) return <p className="smf-small">Loading banners…</p>

  return (
    <div className="smf-admin-cat" data-testid="ad-admin">
      <p className="smf-small">ป้ายโฆษณา 5 ช่อง เว้นว่างได้ ช่องว่างจะแสดงข้อความติดต่อไลน์</p>
      {slots.map((slot) => (
        <AdEditor
          key={slot.slot}
          slot={slot}
          onSaved={(next) => {
            setSlots(next)
            setSaved(slot.slot)
            setError(null)
          }}
          onError={(message) => {
            setSaved(null)
            setError(message)
          }}
        />
      ))}
      {saved ? <p className="smf-small">บันทึกช่อง {saved} แล้ว</p> : null}
      {error ? <p className="smf-error">{error}</p> : null}
    </div>
  )
}

function AdEditor({
  slot,
  onSaved,
  onError,
}: {
  slot: AdSlot
  onSaved: (slots: AdSlot[]) => void
  onError: (message: string) => void
}) {
  const [imageUrl, setImageUrl] = useState(slot.imageUrl)
  const [linkUrl, setLinkUrl] = useState(slot.linkUrl)
  const [alt, setAlt] = useState(slot.alt)
  const [pending, setPending] = useState(false)

  async function save() {
    setPending(true)
    try {
      const payload = await forumSend<{ slots: AdSlot[] }>(`/api/forum/ads/${slot.slot}`, 'PUT', { imageUrl, linkUrl, alt })
      onSaved(payload.slots)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'บันทึกป้ายไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="smf-ad-editor"
      data-testid={`ad-editor-${slot.slot}`}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <span>ช่อง {slot.slot}</span>
      <input className="smf-input" value={imageUrl} placeholder="Image URL" aria-label={`รูปป้าย ${slot.slot}`} data-testid={`ad-image-${slot.slot}`} onChange={(event) => setImageUrl(event.target.value)} />
      <input className="smf-input" value={linkUrl} placeholder="Link URL" aria-label={`ลิงก์ป้าย ${slot.slot}`} data-testid={`ad-link-${slot.slot}`} onChange={(event) => setLinkUrl(event.target.value)} />
      <input className="smf-input" value={alt} placeholder="Alt text" maxLength={120} aria-label={`คำอธิบายป้าย ${slot.slot}`} data-testid={`ad-alt-${slot.slot}`} onChange={(event) => setAlt(event.target.value)} />
      <button type="submit" className="smf-button" disabled={pending} data-testid={`ad-save-${slot.slot}`}>
        Save
      </button>
    </form>
  )
}

function AdCard({ slot }: { slot: AdSlot }) {
  if (!slot.imageUrl) {
    return (
      <div className="smf-ad smf-ad-empty" data-testid={`ad-slot-${slot.slot}`}>
        <strong>ป้ายโฆษณาว่าง</strong>
        <a href={LINE_URL} target="_blank" rel="noreferrer">
          ติดต่อโฆษณา แอดไลน์ ID: fibo99
        </a>
      </div>
    )
  }
  const image = <img src={slot.imageUrl} alt={slot.alt || 'ป้ายโฆษณา'} />
  return (
    <div className="smf-ad" data-testid={`ad-slot-${slot.slot}`}>
      {slot.linkUrl ? (
        <a href={slot.linkUrl} target="_blank" rel="noreferrer">
          {image}
        </a>
      ) : (
        image
      )}
    </div>
  )
}

function emptySlots(): AdSlot[] {
  return [1, 2, 3, 4, 5].map((slot) => ({ slot, imageUrl: '', linkUrl: '', alt: '' }))
}

function visitorId() {
  const key = 'khuiwong.visitor'
  try {
    const existing = localStorage.getItem(key)
    if (existing && /^[A-Za-z0-9_-]{8,80}$/.test(existing)) return existing
    const next = crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(key, next)
    return next
  } catch {
    return 'visitor-fallback'
  }
}
