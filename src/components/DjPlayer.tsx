import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { sessionToken } from '@/lib/session.ts'
import type { DjState } from '@/types.ts'

export function DjPlayer({
  roomId,
  dj,
  canControl,
  onPlay,
  onPause,
  onSkip,
  onRemove,
}: {
  roomId: string
  dj: DjState
  canControl: boolean
  onPlay: (trackId?: string) => void
  onPause: () => void
  onSkip: (direction: 1 | -1) => void
  onRemove: (trackId: string) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const skewRef = useRef(0)
  const [volume, setVolume] = useState(() => {
    const stored = Number(localStorage.getItem('khuiwong.djVolume'))
    return Number.isFinite(stored) ? stored : 0.8
  })
  const [needsGesture, setNeedsGesture] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    skewRef.current = dj.serverNow - Date.now()
  }, [dj.serverNow])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
    if (!dj.track) {
      audio.pause()
      audio.removeAttribute('src')
      return
    }
    const url = new URL(dj.track.url, window.location.origin).href
    if (audio.src !== url) audio.src = url
    const expected = positionSeconds(dj, skewRef.current)
    if (Math.abs((audio.currentTime || 0) - expected) > 0.45) audio.currentTime = expected
    if (dj.playing) {
      void audio.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true))
    } else {
      audio.pause()
    }
  }, [dj, volume])

  async function upload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const body = new FormData()
      body.set('track', file)
      const headers = new Headers()
      const token = sessionToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const response = await fetch(`/api/rooms/${roomId}/dj/tracks`, { method: 'POST', body, headers })
      const data = (await response.json().catch(() => ({}))) as { message?: string }
      if (!response.ok) throw new Error(data.message || 'อัปโหลดไม่สำเร็จ')
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section data-testid="dj-player" className="border-t border-border bg-ink/80 px-3 py-2">
      <audio ref={audioRef} data-testid="dj-audio" preload="auto" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-wide text-muted-foreground">กำลังเปิด</p>
          <p data-testid="now-playing" className="truncate text-sm font-medium">
            {dj.track ? dj.track.title : 'ยังไม่มีเพลง'}
            {dj.playing ? '' : dj.track ? ' · หยุดชั่วคราว' : ''}
          </p>
        </div>
        {needsGesture ? (
          <Button type="button" size="sm" onClick={() => void audioRef.current?.play().then(() => setNeedsGesture(false))}>
            แตะเพื่อเปิดเพลง
          </Button>
        ) : null}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          เสียงเพลง
          <input
            data-testid="dj-volume"
            aria-label="ระดับเสียงเพลงของฉัน"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value)
              setVolume(next)
              localStorage.setItem('khuiwong.djVolume', String(next))
            }}
          />
        </label>
        {canControl ? (
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="secondary" className="h-9 w-9" aria-label="เพลงก่อนหน้า" onClick={() => onSkip(-1)}>
              <SkipBack />
            </Button>
            {dj.playing ? (
              <Button type="button" size="icon" className="h-9 w-9" aria-label="หยุดชั่วคราว" onClick={onPause}>
                <Pause />
              </Button>
            ) : (
              <Button type="button" size="icon" className="h-9 w-9" aria-label="เล่น" data-testid="dj-play" onClick={() => onPlay()}>
                <Play />
              </Button>
            )}
            <Button type="button" size="icon" variant="secondary" className="h-9 w-9" aria-label="เพลงถัดไป" onClick={() => onSkip(1)}>
              <SkipForward />
            </Button>
          </div>
        ) : null}
      </div>
      {canControl ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-secondary px-3 py-1.5 text-xs text-paper">
            เลือกไฟล์เพลง
            <input
              data-testid="dj-file"
              className="sr-only"
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,.mp3,.wav,.ogg,.m4a,.webm"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                void upload(file)
              }}
            />
          </label>
          {uploading ? <span className="text-xs text-muted-foreground">กำลังอัปโหลด...</span> : null}
          {uploadError ? <span className="text-xs text-rose">{uploadError}</span> : null}
        </div>
      ) : null}
      {canControl && dj.playlist.length > 0 ? (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {dj.playlist.map((track) => (
            <li key={track.id} data-testid="dj-track" className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs">
              <button type="button" className="max-w-40 truncate" onClick={() => onPlay(track.id)}>
                {track.title}
              </button>
              <button type="button" aria-label={`ลบ ${track.title}`} onClick={() => onRemove(track.id)}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function positionSeconds(dj: DjState, skewMs: number) {
  if (!dj.playing || dj.startedAt == null) return dj.offsetMs / 1000
  const serverNow = Date.now() + skewMs
  return Math.max(0, (dj.offsetMs + (serverNow - dj.startedAt)) / 1000)
}
