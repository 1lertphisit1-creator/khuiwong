import { useEffect, useState } from 'react'
import { forumGet, forumSend, type ForumMe } from '@/lib/forum.ts'
import { go, type AppRoute } from '@/lib/route.ts'
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

export function AdSlots({ canEdit = false }: { canEdit?: boolean }) {
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

  const visible = (slots ?? emptySlots()).filter((slot) => canEdit || slot.enabled)
  return (
    <section className="smf-ads" data-testid="ad-slots" aria-label="โฆษณา">
      {visible.map((slot) => (
        <AdCard key={slot.slot} slot={slot} canEdit={canEdit} />
      ))}
    </section>
  )
}

export function AdAdminPage() {
  const [me, setMe] = useState<ForumMe | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void forumGet<{ me: ForumMe }>('/api/forum/bootstrap')
      .then((payload) => setMe(payload.me))
      .catch(() => setMe(null))
      .finally(() => setReady(true))
  }, [])

  if (!ready) return <p className="smf-small">Loading…</p>
  const allowed = me?.rank === 'owner' || me?.rank === 'admin'
  if (!allowed) {
    return (
      <div data-testid="ad-admin-denied">
        <p className="smf-note">เฉพาะเจ้าของหรือผู้ดูแล</p>
      </div>
    )
  }
  return (
    <div data-testid="ad-admin-page">
      <section className="smf-block">
        <div className="smf-cat">จัดการป้ายโฆษณา</div>
        <div className="smf-form-body">
          <AdAdmin />
        </div>
      </section>
    </div>
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

  useEffect(() => {
    const scroll = () => {
      const id = window.location.hash.replace('#', '')
      if (!id) return
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    }
    scroll()
    window.addEventListener('popstate', scroll)
    return () => window.removeEventListener('popstate', scroll)
  }, [slots])

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
      {saved ? (
        <p className="smf-toast" role="status" data-testid="ad-toast">
          บันทึกแล้ว
        </p>
      ) : null}
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
  const [preview, setPreview] = useState(slot.image)
  const [pending, setPending] = useState(false)

  async function chooseFile(next: File | undefined) {
    if (!next) return
    if (!next.type.startsWith('image/')) {
      onError('เลือกไฟล์รูปภาพ')
      return
    }
    const shrunk = await shrinkAdImage(next)
    setFile(new File([shrunk], 'banner.jpg', { type: 'image/jpeg' }))
    setPreview(URL.createObjectURL(shrunk))
  }

  async function save() {
    setPending(true)
    try {
      let payload = await forumSend<{ slots: AdSlot[] }>(`/api/forum/ads/${slot.slot}`, 'PUT', { imageUrl, linkUrl, alt, enabled })
      if (file) {
        const headers = new Headers()
        const token = sessionToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
        headers.set('Content-Type', 'image/jpeg')
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
      <strong id={`slot-${slot.slot}`}>ช่อง {slot.slot}</strong>
      <p className="smf-small">ขนาดแนะนำ 600×200 px สัดส่วน 3:1 แสดงประมาณ 300×100 บนเดสก์ท็อป และย่อลงบนมือถือแบบ contain ไม่ครอปรูป</p>
      {preview ? <img className="smf-ad-preview" src={preview} alt="" /> : null}
      <label className="smf-check">
        <input type="checkbox" checked={enabled} data-testid={`ad-enabled-${slot.slot}`} onChange={(event) => setEnabled(event.target.checked)} />
        แสดงบนเว็บ
      </label>
      <label className="smf-file-btn">
        📷 เลือกรูปจากมือถือ/คอม
        <input
          className="smf-file-input"
          type="file"
          accept="image/*"
          aria-label={`ไฟล์รูปป้าย ${slot.slot}`}
          data-testid={`ad-file-${slot.slot}`}
          onChange={(event) => {
            const next = event.target.files?.[0]
            event.target.value = ''
            void chooseFile(next)
          }}
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
        <span>ลิงก์ปลายทาง</span>
        <input className="smf-input" value={linkUrl} placeholder="https://" aria-label={`ลิงก์ป้าย ${slot.slot}`} data-testid={`ad-link-${slot.slot}`} onChange={(event) => setLinkUrl(event.target.value)} />
      </label>
      <label className="smf-field">
        <span>ชื่อลูกค้า</span>
        <input className="smf-input" value={alt} maxLength={120} aria-label={`คำอธิบายป้าย ${slot.slot}`} data-testid={`ad-alt-${slot.slot}`} onChange={(event) => setAlt(event.target.value)} />
      </label>
      <div className="smf-form-actions">
        <button type="submit" className="smf-button" disabled={pending} data-testid={`ad-save-${slot.slot}`}>
          บันทึก
        </button>
        <button type="button" className="smf-button smf-button-alt" disabled={pending} data-testid={`ad-clear-${slot.slot}`} onClick={() => void clearSlot()}>
          ล้างป้าย (กลับเป็นป้ายว่าง)
        </button>
      </div>
    </form>
  )

  async function clearSlot() {
    setPending(true)
    try {
      const payload = await forumSend<{ slots: AdSlot[] }>(`/api/forum/ads/${slot.slot}`, 'PUT', {
        imageUrl: '',
        linkUrl: '',
        alt: '',
        enabled: true,
        clearImage: true,
      })
      setImageUrl('')
      setLinkUrl('')
      setAlt('')
      setEnabled(true)
      setFile(null)
      setPreview('')
      onSaved(payload.slots)
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'ล้างป้ายไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }
}

function AdCard({ slot, canEdit }: { slot: AdSlot; canEdit: boolean }) {
  const empty = (
    <>
      {!slot.enabled ? <strong>ปิดอยู่</strong> : <strong>ป้ายโฆษณาว่าง</strong>}
      {canEdit ? null : (
        <a href={LINE_URL} target="_blank" rel="noopener noreferrer">
          ติดต่อโฆษณา แอดไลน์ ID: fibo99
        </a>
      )}
    </>
  )
  const picture = slot.image ? <img src={slot.image} alt={slot.alt || 'ป้ายโฆษณา'} /> : empty
  if (canEdit) {
    return (
      <button type="button" className="smf-ad smf-ad-editable" data-testid={`ad-slot-${slot.slot}`} onClick={() => go(`/admin/ads#slot-${slot.slot}`)}>
        {picture}
        <span className="smf-ad-edit" data-testid={`ad-edit-${slot.slot}`}>
          ✏️ แก้ไขป้ายนี้
        </span>
      </button>
    )
  }
  if (!slot.image) {
    return (
      <div className="smf-ad smf-ad-empty" data-testid={`ad-slot-${slot.slot}`}>
        {empty}
      </div>
    )
  }
  return (
    <div className="smf-ad" data-testid={`ad-slot-${slot.slot}`}>
      {slot.linkUrl ? (
        <a className="smf-ad-link" href={slot.linkUrl} target="_blank" rel="sponsored noopener noreferrer">
          {picture}
        </a>
      ) : (
        picture
      )}
    </div>
  )
}

async function shrinkAdImage(file: File) {
  if (file.size <= 1024 * 1024 && file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1200 / bitmap.width, 400 / bitmap.height)
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('แปลงรูปไม่สำเร็จ')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  let quality = 0.86
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  while (blob && blob.size > 900_000 && quality > 0.45) {
    quality -= 0.12
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  }
  if (!blob || blob.size > 1024 * 1024) throw new Error('รูปยังใหญ่เกิน 1 MB หลังย่อ')
  return blob
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
