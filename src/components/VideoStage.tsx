import { useEffect, useRef, useState } from 'react'
import { MicOff } from 'lucide-react'
import { cn } from '@/lib/utils.ts'
import { safeColor, type Participant } from '@/types.ts'

export function VideoStage({
  people,
  selfId,
  remoteStreams,
  localStream,
  notice,
}: {
  people: Participant[]
  selfId: string | null
  remoteStreams: Record<string, MediaStream>
  localStream: MediaStream | null
  notice: string | null
}) {
  const ordered = [...people].sort((a, b) => {
    if (a.id === selfId) return -1
    if (b.id === selfId) return 1
    return 0
  })

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
      <div className={cn('grid min-h-0 flex-1 gap-3', layout)}>
        {ordered.map((person) => {
          const self = person.id === selfId
          return (
            <VideoTile
              key={person.id}
              name={person.name}
              self={self}
              audioOn={person.audio}
              videoOn={person.video}
              color={person.color}
              stream={self ? localStream : (remoteStreams[person.id] ?? null)}
            />
          )
        })}
        {ordered.length <= 1 ? <InviteCard /> : null}
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
  stream,
}: {
  name: string
  self: boolean
  color: string
  audioOn: boolean
  videoOn: boolean
  stream: MediaStream | null
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
      className="relative h-full min-h-40 overflow-hidden rounded-[1.3rem] bg-ink shadow-[inset_0_0_0_1px_rgba(246,241,231,0.08)]"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={self}
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          self && '-scale-x-100',
          !showVideo && 'opacity-0',
        )}
      />
      {!showVideo ? <Avatar name={name} /> : null}
      {needsGesture ? (
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
        {!audioOn ? (
          <span
            aria-label="ไมค์ปิด"
            className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-rose text-paper"
          >
            <MicOff className="size-4" />
          </span>
        ) : null}
      </div>
    </article>
  )
}

function Avatar({ name }: { name: string }) {
  const letter = [...name][0] ?? '?'
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(230,161,92,0.28),transparent_42%),radial-gradient(circle_at_80%_90%,rgba(127,191,178,0.22),transparent_40%),#17140f]">
      <span className="font-display grid h-20 w-20 place-items-center rounded-full bg-ink/50 text-3xl">{letter}</span>
    </div>
  )
}
