import { useEffect, useState } from 'react'
import { forumGet, forumSend } from '@/lib/forum.ts'
import type { AppRoute } from '@/lib/route.ts'
import { sessionToken } from '@/lib/session.ts'

type ViewTotals = { total: number; today: number }
type AdSlot = {
  slot: number
  imageUrl: string
  linkUrl: string
  alt: string
  enabled: boolean
  hasFile: boolean
  image: string
}

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
      {(slots ?? emptySlots()).filter((slot) => slot.enabled).map((slot) => (
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
      <p className="smf-small">ป้ายโฆษณา 5 ช่อง สัดส่วนคงที่ 3:1 ขนาดแนะนำ 600×200 px บนเดสก์ท็อปแสดงประมาณ 300×100 และเล็กลงบนมือถือโดยไม่ตัดรูป</p>
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
  const [enabled, setEnabled] = useState(slot.enabled)
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState(false)

  async function save() {
    setPending(true)
    try {
      let payload = await forumSend<{ slots: AdSlot[] }>(`/api/forum/ads/${slot.slot}`, 'PUT', { imageUrl, linkUrl, alt, enabled })
      if (file) {
        if (file.size > 1024 * 1024) throw new Error('รูปใหญ่เกิน 1 MB')
        const headers = new Headers()
        const token = sessionToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
        headers.set('Content-Type', file.type || 'application/octet-stream')
        const response = await fetch(`/api/forum/ads/${slot.slot}/image`, { method: 'POST', body: file, headers })
        const data = (await response.json().catch(() => ({}))) as { message?: string; slots?: AdSlot[] }
        if (!response.ok || !data.slots) throw new Error(data.message || 'อัปโหลดรูปไม่สำเร็จ')
        payload = { slots: data.slots }
        setFile(null)
      }
      onSaved(payload.slots)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'บันทึกป้ายไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

  async function clearFile() {
    setPending(true)
    try {
      const payload = await forumSend<{ slots: AdSlot[] }>(`/api/forum/ads/${slot.slot}`, 'PUT', {
        imageUrl,
        linkUrl,
        alt,
        enabled,
        clearImage: true,
      })
      setFile(null)
      onSaved(payload.slots)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'ลบรูปไม่สำเร็จ')
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
      <strong>ช่อง {slot.slot}</strong>
      <p className="smf-small">ขนาดแนะนำ 600×200 px สัดส่วน 3:1 แสดงประมาณ 300×100 บนเดสก์ท็อป และย่อลงบนมือถือแบบ contain ไม่ครอปรูป</p>
      <label className="smf-check">
        <input type="checkbox" checked={enabled} data-testid={`ad-enabled-${slot.slot}`} onChange={(event) => setEnabled(event.target.checked)} />
        เปิดใช้งาน
      </label>
      <label className="smf-field">
        <span>อัปโหลดรูป (jpg, png, webp, gif ไม่เกิน 1 MB)</span>
        <input
          className="smf-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-label={`ไฟล์รูปป้าย ${slot.slot}`}
          data-testid={`ad-file-${slot.slot}`}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {slot.hasFile ? (
        <button type="button" className="smf-button smf-button-alt" disabled={pending} onClick={() => void clearFile()}>
          ลบไฟล์ที่อัปโหลด
        </button>
      ) : null}
      <label className="smf-field">
        <span>หรือลิงก์รูป</span>
        <input className="smf-input" value={imageUrl} placeholder="https://" aria-label={`รูปป้าย ${slot.slot}`} data-testid={`ad-image-${slot.slot}`} onChange={(event) => setImageUrl(event.target.value)} />
      </label>
      <label className="smf-field">
        <span>ลิงก์เมื่อคลิก</span>
        <input className="smf-input" value={linkUrl} placeholder="https://" aria-label={`ลิงก์ป้าย ${slot.slot}`} data-testid={`ad-link-${slot.slot}`} onChange={(event) => setLinkUrl(event.target.value)} />
      </label>
      <label className="smf-field">
        <span>ชื่อผู้โฆษณา / alt</span>
        <input className="smf-input" value={alt} maxLength={120} aria-label={`คำอธิบายป้าย ${slot.slot}`} data-testid={`ad-alt-${slot.slot}`} onChange={(event) => setAlt(event.target.value)} />
      </label>
      <button type="submit" className="smf-button" disabled={pending} data-testid={`ad-save-${slot.slot}`}>
        Save
      </button>
    </form>
  )
}

function AdCard({ slot }: { slot: AdSlot }) {
  if (!slot.image) {
    return (
      <div className="smf-ad smf-ad-empty" data-testid={`ad-slot-${slot.slot}`}>
        <strong>ป้ายโฆษณาว่าง</strong>
        <a href={LINE_URL} target="_blank" rel="noopener noreferrer">
          ติดต่อโฆษณา แอดไลน์ ID: fibo99
        </a>
      </div>
    )
  }
  const image = <img src={slot.image} alt={slot.alt || 'ป้ายโฆษณา'} />
  return (
    <div className="smf-ad" data-testid={`ad-slot-${slot.slot}`}>
      {slot.linkUrl ? (
        <a className="smf-ad-link" href={slot.linkUrl} target="_blank" rel="sponsored noopener noreferrer">
          {image}
        </a>
      ) : (
        image
      )}
    </div>
  )
}

function emptySlots(): AdSlot[] {
  return [1, 2, 3, 4, 5].map((slot) => ({ slot, imageUrl: '', linkUrl: '', alt: '', enabled: true, hasFile: false, image: '' }))
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
