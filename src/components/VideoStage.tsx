import { useEffect, useRef, useState } from 'react'
import { Maximize2, MicOff, Minimize2, MonitorUp } from 'lucide-react'
import { AvatarFace } from '@/components/AvatarFace.tsx'
import { safeColor, type Participant } from '@/types.ts'

export function VideoStage({
  people,
  selfId,
  localScreen,
  notice,
  bindMic,
  bindScreen,
}: {
  people: Participant[]
  selfId: string | null
  localScreen: MediaStream | null
  notice: string | null
  bindMic: (id: string, element: HTMLAudioElement | null) => void
  bindScreen: (element: HTMLVideoElement | null) => void
}) {
  const ordered = [...people].sort((a, b) => Number(b.speaker) - Number(a.speaker) || a.name.localeCompare(b.name, 'th'))
  const sharers = ordered.filter((person) => person.sharing)
  const featured = sharers[sharers.length - 1] ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      {notice ? (
        <p data-testid="join-notice" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {featured ? (
        <ScreenTheater
          person={featured}
          self={featured.id === selfId}
          stream={featured.id === selfId ? localScreen : null}
          bindScreen={bindScreen}
        />
      ) : null}
      <div data-testid="avatar-grid" className="app-scrollbar grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {ordered.map((person) => (
          <PersonTile key={person.id} person={person} self={person.id === selfId} bindMic={bindMic} />
        ))}
        {ordered.length <= 1 ? <InviteCard /> : null}
      </div>
    </div>
  )
}

function PersonTile({
  person,
  self,
  bindMic,
}: {
  person: Participant
  self: boolean
  bindMic: (id: string, element: HTMLAudioElement | null) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (self || !person.speaker) {
      bindMic(person.id, null)
      return
    }
    bindMic(person.id, audioRef.current)
    return () => bindMic(person.id, null)
  }, [bindMic, person.id, person.speaker, self])

  return (
    <article
      data-testid="video-tile"
      data-self={self ? 'true' : 'false'}
      data-audio={person.audio ? 'true' : 'false'}
      data-speaker={person.speaker ? 'true' : 'false'}
      data-sharing={person.sharing ? 'true' : 'false'}
      className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-[1.3rem] border border-gold/25 bg-ink/70 px-3 py-4"
    >
      <AvatarFace
        name={person.name}
        color={person.color}
        url={person.avatarUrl}
        speaking={person.speaking}
        className="h-20 w-20 text-3xl"
      />
      <div className="flex max-w-full items-center gap-2">
        <span className="truncate text-sm" style={{ color: safeColor(person.color) }}>
          {person.name}
          {self ? ' · คุณ' : ''}
        </span>
        {person.speaker && !person.audio ? <MicOff className="size-4 text-rose" aria-label="ไมค์ปิด" /> : null}
        {person.sharing ? <MonitorUp className="size-4 text-gold" aria-label="กำลังแชร์หน้าจอ" /> : null}
      </div>
      {!self && person.speaker ? <audio ref={audioRef} data-testid="remote-audio" autoPlay /> : null}
    </article>
  )
}

function ScreenTheater({
  person,
  self,
  stream,
  bindScreen,
}: {
  person: Participant
  self: boolean
  stream: MediaStream | null
  bindScreen: (element: HTMLVideoElement | null) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (self && stream) {
      bindScreen(null)
      el.srcObject = stream
      void el.play().catch(() => {})
      return () => {
        el.srcObject = null
      }
    }
    el.srcObject = null
    bindScreen(el)
    return () => bindScreen(null)
  }, [bindScreen, self, stream])

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  function toggleFull() {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen().catch(() => {})
  }

  return (
    <div
      ref={stageRef}
      data-testid="screen-stage"
      data-sharer={person.name}
      className="relative min-h-[42vh] flex-1 cursor-pointer overflow-hidden rounded-[1.3rem] bg-black"
      onClick={toggleFull}
    >
      <video ref={videoRef} autoPlay playsInline muted={self} className="absolute inset-0 h-full w-full bg-black object-contain" />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <div data-testid="screen-live" className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-rose px-2 py-1 text-[11px] font-bold tracking-[0.16em] text-paper">LIVE</span>
          <span className="truncate rounded-full bg-ink/75 px-3 py-1 text-sm backdrop-blur">
            กำลังแชร์จอ · <span data-testid="screen-sharer">{person.name}</span>
          </span>
        </div>
        <button
          type="button"
          data-testid="screen-fullscreen"
          className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1.5 text-sm"
          aria-label={full ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
          onClick={(event) => {
            event.stopPropagation()
            toggleFull()
          }}
        >
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          {full ? 'ออกจากเต็มจอ' : 'เต็มจอ'}
        </button>
      </div>
    </div>
  )
}

function InviteCard() {
  return (
    <div className="grid min-h-36 place-items-center rounded-[1.3rem] border border-dashed border-gold/30 px-4 text-center text-sm text-muted-foreground">
      รอเพื่อน
    </div>
  )
}
