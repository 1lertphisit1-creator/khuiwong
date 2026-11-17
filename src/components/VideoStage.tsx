import { useEffect, useRef, useState } from 'react'
import { Maximize2, MicOff, Minimize2, MonitorUp } from 'lucide-react'
import { cn } from '@/lib/utils.ts'
import { safeColor, type Participant } from '@/types.ts'

export function VideoStage({
  people,
  selfId,
  remoteStreams,
  remoteScreens,
  localStream,
  localScreen,
  notice,
}: {
  people: Participant[]
  selfId: string | null
  remoteStreams: Record<string, MediaStream>
  remoteScreens: Record<string, MediaStream>
  localStream: MediaStream | null
  localScreen: MediaStream | null
  notice: string | null
}) {
  const ordered = [...people].sort((a, b) => {
    if (a.id === selfId) return -1
    if (b.id === selfId) return 1
    return 0
  })
  const sharers = ordered.filter((person) => person.sharing)
  const [picked, setPicked] = useState<string | null>(null)
  const featured = sharers.find((person) => person.id === picked) ?? sharers[sharers.length - 1] ?? null

  const count = ordered.length + (ordered.length <= 1 ? 1 : 0)
  const layout =
    count <= 2
      ? 'grid-cols-1 grid-rows-2 sm:grid-cols-2 sm:grid-rows-1'
      : count <= 4
        ? 'grid-cols-1 auto-rows-fr sm:grid-cols-2'
        : 'grid-cols-1 auto-rows-fr sm:grid-cols-2 xl:grid-cols-3'

  return (
    <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
      {notice ? (
        <p data-testid="join-notice" className="mb-3 text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {featured ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <ScreenTheater
            person={featured}
            self={featured.id === selfId}
            stream={featured.id === selfId ? localScreen : (remoteScreens[featured.id] ?? null)}
          />
          {sharers.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto">
              {sharers.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-1 text-xs',
                    person.id === featured.id ? 'border-amber text-amber' : 'border-border text-muted-foreground',
                  )}
                  onClick={() => setPicked(person.id)}
                >
                  จอของ{person.name}
                </button>
              ))}
            </div>
          ) : null}
          <div data-testid="camera-strip" className="flex h-28 shrink-0 gap-2 overflow-x-auto">
            {ordered.map((person) => (
              <VideoTile
                key={person.id}
                name={person.name}
                self={person.id === selfId}
                audioOn={person.audio}
                videoOn={person.video}
                sharing={person.sharing}
                color={person.color}
                compact
                stream={person.id === selfId ? localStream : (remoteStreams[person.id] ?? null)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={cn('grid min-h-0 flex-1 gap-3', layout)}>
          {ordered.map((person) => (
            <VideoTile
              key={person.id}
              name={person.name}
              self={person.id === selfId}
              audioOn={person.audio}
              videoOn={person.video}
              sharing={person.sharing}
              color={person.color}
              stream={person.id === selfId ? localStream : (remoteStreams[person.id] ?? null)}
            />
          ))}
          {ordered.length <= 1 ? <InviteCard /> : null}
        </div>
      )}
    </div>
  )
}

function ScreenTheater({
  person,
  self,
  stream,
}: {
  person: Participant
  self: boolean
  stream: MediaStream | null
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [full, setFull] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const liveVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live'))

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    if (!stream) return
    void el
      .play()
      .then(() => setNeedsGesture(false))
      .catch(() => {
        if (!self) setNeedsGesture(true)
      })
  }, [self, stream])

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
      className="relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-[1.3rem] bg-black shadow-[inset_0_0_0_1px_rgba(246,241,231,0.08)]"
      onClick={toggleFull}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={self}
        className={cn('absolute inset-0 h-full w-full bg-black object-contain', !liveVideo && 'opacity-0')}
      />
      {!liveVideo ? (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">กำลังรับภาพหน้าจอ...</div>
      ) : null}
      {needsGesture ? (
        <button
          type="button"
          className="absolute inset-x-0 bottom-16 z-10 mx-auto w-fit rounded-full bg-ink/80 px-4 py-2 text-sm"
          onClick={(event) => {
            event.stopPropagation()
            void videoRef.current?.play().then(() => setNeedsGesture(false))
          }}
        >
          แตะเพื่อเปิดเสียง
        </button>
      ) : null}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
        <div data-testid="screen-live" className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-rose px-2 py-1 text-[11px] font-bold tracking-[0.16em] text-paper">LIVE</span>
          <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-ink/75 px-3 py-1 text-sm backdrop-blur">
            <MonitorUp className="size-4 shrink-0 text-amber" />
            <span className="truncate">
              กำลังแชร์จอ · <span data-testid="screen-sharer">{person.name}</span>
            </span>
          </span>
        </div>
        <button
          type="button"
          data-testid="screen-fullscreen"
          className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1.5 text-sm backdrop-blur hover:bg-ink"
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
    <div className="grid h-full min-h-40 place-items-center rounded-[1.3rem] border border-dashed border-border bg-ink/40 px-6 text-center">
      <div>
        <p className="font-display text-xl font-bold">ยังมีแค่คุณ</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          ส่งรหัสหรือลิงก์ห้องให้คนที่อยากคุยด้วย แล้วภาพของเขาจะขึ้นตรงนี้
        </p>
      </div>
    </div>
  )
}

function VideoTile({
  name,
  self,
  color,
  audioOn,
  videoOn,
  sharing,
  stream,
  compact = false,
}: {
  name: string
  self: boolean
  color: string
  audioOn: boolean
  videoOn: boolean
  sharing: boolean
  stream: MediaStream | null
  compact?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [needsGesture, setNeedsGesture] = useState(false)
  const showVideo = Boolean(stream && videoOn && stream.getVideoTracks().some((track) => track.readyState === 'live'))

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (el.srcObject !== stream) el.srcObject = stream
    if (!stream) return
    void el
      .play()
      .then(() => setNeedsGesture(false))
      .catch(() => {
        if (!self) setNeedsGesture(true)
      })
  }, [self, stream])

  return (
    <article
      data-testid="video-tile"
      data-self={self ? 'true' : 'false'}
      data-audio={audioOn ? 'true' : 'false'}
      data-video={videoOn ? 'true' : 'false'}
      data-sharing={sharing ? 'true' : 'false'}
      className={cn(
        'relative overflow-hidden rounded-[1.3rem] bg-ink shadow-[inset_0_0_0_1px_rgba(246,241,231,0.08)]',
        compact ? 'h-full min-h-0 w-40 shrink-0' : 'h-full min-h-40',
      )}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={self}
        className={cn('absolute inset-0 h-full w-full object-cover', self && '-scale-x-100', !showVideo && 'opacity-0')}
      />
      {!showVideo ? <Avatar name={name} compact={compact} /> : null}
      {needsGesture && !compact ? (
        <button
          type="button"
          className="absolute inset-0 grid place-items-center bg-ink/40 text-sm"
          onClick={() => {
            void videoRef.current?.play().then(() => setNeedsGesture(false))
          }}
        >
          แตะเพื่อเปิดเสียง
        </button>
      ) : null}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-2">
        <span className="truncate rounded-full bg-ink/70 px-2.5 py-1 text-sm backdrop-blur" style={{ color: safeColor(color) }}>
          {name}
          {self ? ' · คุณ' : ''}
        </span>
        {sharing ? (
          <span aria-label="กำลังแชร์หน้าจอ" className="grid h-8 w-8 place-items-center rounded-full bg-amber text-ink">
            <MonitorUp className="size-4" />
          </span>
        ) : null}
        {!audioOn ? (
          <span aria-label="ไมค์ปิด" className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-rose text-paper">
            <MicOff className="size-4" />
          </span>
        ) : null}
      </div>
    </article>
  )
}

function Avatar({ name, compact }: { name: string; compact: boolean }) {
  const letter = [...name][0] ?? '?'
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(230,161,92,0.28),transparent_42%),radial-gradient(circle_at_80%_90%,rgba(127,191,178,0.22),transparent_40%),#17140f]">
      <span className={cn('font-display grid place-items-center rounded-full bg-ink/50', compact ? 'h-10 w-10 text-lg' : 'h-20 w-20 text-3xl')}>
        {letter}
      </span>
    </div>
  )
}
