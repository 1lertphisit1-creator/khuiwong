import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, LogOut } from 'lucide-react'
import { AdminPanel } from '@/components/AdminPanel.tsx'
import { ChatPanel } from '@/components/ChatPanel.tsx'
import { ControlBar } from '@/components/ControlBar.tsx'
import { DjPlayer } from '@/components/DjPlayer.tsx'
import { FollowLinks } from '@/components/FollowLinks.tsx'
import { PeoplePanel } from '@/components/PeoplePanel.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { VideoStage } from '@/components/VideoStage.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Logo } from '@/components/Logo.tsx'
import { useRoom } from '@/hooks/useRoom.ts'
import { clearEntry, type StagedEntry } from '@/lib/entry.ts'
import { acquireMedia, stopStream } from '@/lib/media.ts'
import { roomLink } from '@/lib/route.ts'
import { cn, copyText } from '@/lib/utils.ts'
import type { ChatMessage, Participant, Permissions } from '@/types.ts'

let roomMounts = 0

export function RoomScreen({
  entry,
  onLeave,
}: {
  entry: StagedEntry
  onLeave: () => void
}) {
  const [stream, setStream] = useState<MediaStream | null>(entry.media.stream)
  const [warning, setWarning] = useState<string | null>(entry.media.warning)
  const [warningOpen, setWarningOpen] = useState(Boolean(entry.media.warning))
  const [retrying, setRetrying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pane, setPane] = useState<'video' | 'chat' | 'people'>('video')
  const [adminOpen, setAdminOpen] = useState(false)
  const [readCount, setReadCount] = useState(0)
  const streamRef = useRef(stream)

  const room = useRoom({
    roomId: entry.code,
    displayName: entry.name,
    localStream: stream,
  })

  useEffect(() => {
    streamRef.current = stream
  }, [stream])

  useEffect(() => {
    roomMounts += 1
    return () => {
      roomMounts -= 1
      const current = streamRef.current
      window.setTimeout(() => {
        if (roomMounts === 0) stopStream(current)
      }, 150)
    }
  }, [])

  const notice = useJoinNotice(room.messages)
  const desktop = useDesktopLayout()
  const chatTotal = room.messages.reduce((count, message) => count + (message.kind === 'chat' ? 1 : 0), 0)
  const seenTarget = desktop || pane === 'chat' ? chatTotal : readCount
  if (seenTarget !== readCount) setReadCount(seenTarget)
  const unread = Math.max(0, chatTotal - readCount)

  const people = useMemo<Participant[]>(() => {
    return room.participants.map((person) =>
      person.id === room.selfId ? { ...person, audio: room.audioOn, sharing: room.sharing } : person,
    )
  }, [room.audioOn, room.participants, room.selfId, room.sharing])

  async function retry() {
    setRetrying(true)
    const next = await acquireMedia()
    setRetrying(false)
    if (next.stream) {
      stopStream(streamRef.current)
      setStream(next.stream)
    }
    setWarning(next.warning)
    setWarningOpen(Boolean(next.warning))
  }

  async function copyLink() {
    const ok = await copyText(roomLink(entry.code))
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  function leave() {
    stopStream(streamRef.current)
    clearEntry()
    onLeave()
  }

  if (room.error) {
    return (
      <main className="grid h-dvh place-items-center px-6">
        <div className="max-w-md text-center">
          <Logo className="justify-center" />
          <h1 className="font-display mt-6 text-3xl font-bold">เข้าห้องไม่ได้</h1>
          <p role="alert" className="mt-3 text-muted-foreground">
            {room.error}
          </p>
          <Button className="mt-6" onClick={leave}>
            กลับหน้าแรก
          </Button>
        </div>
      </main>
    )
  }

  const statusLabel =
    room.status === 'connected'
      ? 'เชื่อมต่อแล้ว'
      : room.status === 'connecting'
        ? 'กำลังเชื่อมต่อ'
        : 'กำลังเชื่อมต่อใหม่'

  return (
    <main data-testid="room" className="flex h-full min-h-[100%] flex-col">
      <header className="flex items-center gap-2 border-b border-gold/35 bg-burgundy/80 px-3 py-2.5 backdrop-blur sm:gap-4 sm:px-4">
        <Logo compact />
        <div className="min-w-0">
          <div className="text-[11px] tracking-wide text-muted-foreground">รหัสห้อง</div>
          <div className="flex items-center gap-1">
            <span data-testid="room-code" className="font-mono text-lg tracking-[0.18em]">
              {entry.code}
            </span>
            <span data-testid="room-capacity" className="text-xs text-muted-foreground">
              {room.participants.length}/{room.caps.people} · ไมค์ {room.caps.speakers}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
              data-testid="copy-link"
              onClick={() => void copyLink()}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <p
            data-testid="connection-status"
            className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm"
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                room.status === 'connected' ? 'bg-teal' : 'animate-pulse bg-amber',
              )}
            />
            <span className="max-[420px]:sr-only">{statusLabel}</span>
          </p>
          {room.self.rank ? <RankBadge rank={room.self.rank} label={room.self.rankLabel} /> : null}
          {canModerate(room.self.permissions) ? (
            <Button type="button" size="sm" variant="secondary" data-testid="open-admin" onClick={() => setAdminOpen(true)}>
              จัดการ
            </Button>
          ) : null}
          <Button type="button" variant="destructive" size="sm" data-testid="leave" onClick={leave}>
            <LogOut />
            <span className="max-[420px]:sr-only">ออกจากห้อง</span>
          </Button>
        </div>
      </header>

      {room.modNotice ? (
        <div className="flex items-center gap-3 border-b border-amber/30 bg-amber/10 px-4 py-2 text-sm" role="status">
          <p className="flex-1">{room.modNotice}</p>
          <Button type="button" size="sm" variant="ghost" onClick={room.clearModNotice}>
            ปิด
          </Button>
        </div>
      ) : null}

      {warningOpen && warning ? (
        <div
          data-testid="media-warning"
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-rose/30 bg-rose/12 px-4 py-2.5 text-sm"
        >
          <p className="min-w-0 flex-1">{warning}</p>
          <Button type="button" size="sm" variant="secondary" disabled={retrying} onClick={() => void retry()}>
            {retrying ? 'กำลังลอง...' : 'ลองอีกครั้ง'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setWarningOpen(false)}>
            ปิด
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col', pane !== 'video' && 'hidden lg:flex')}>
          <VideoStage
            people={people}
            selfId={room.selfId}
            localScreen={room.screenStream}
            notice={notice}
            bindMic={room.bindMic}
            bindScreen={room.bindScreen}
          />
          <ControlBar
            audioOn={room.audioOn}
            sharing={room.sharing}
            hasAudio={room.hasAudio}
            micAllowed={room.self.micAllowed}
            screenAllowed={room.self.screenAllowed}
            speaker={room.speaker}
            handRaised={room.handRaised}
            canTakeSlot={!room.speaker && room.self.permissions.mute && room.self.micAllowed}
            disabled={room.status !== 'connected' || retrying}
            screenNotice={room.screenNotice}
            onToggleAudio={room.toggleAudio}
            onRaiseHand={room.raiseHand}
            onTakeSlot={room.takeSlot}
            onToggleScreen={() => void room.toggleScreen()}
            onRetry={() => void retry()}
          />
        </section>

        {desktop ? (
          <aside className="flex min-h-0 w-[22.5rem] shrink-0 flex-col border-l border-border">
            <div className="h-[38%] min-h-36 shrink-0 overflow-hidden border-b border-border">
              <PeoplePanel
                people={people}
                selfId={room.selfId}
                onUploadAvatar={async (file) => {
                  try {
                    await room.uploadAvatar(file)
                  } catch (reason) {
                    setWarning(reason instanceof Error ? reason.message : 'อัปโหลดรูปไม่สำเร็จ')
                    setWarningOpen(true)
                  }
                }}
              />
            </div>
            <ChatPanel
              messages={room.messages}
              selfId={room.selfId}
              disabled={room.status !== 'connected'}
              blocked={room.self.textMuted}
              onSend={room.sendChat}
            />
            <FollowLinks />
          </aside>
        ) : (
          <>
            <section className={cn('min-h-0 flex-1', pane !== 'chat' && 'hidden')}>
              <ChatPanel
                messages={room.messages}
                selfId={room.selfId}
                disabled={room.status !== 'connected'}
                blocked={room.self.textMuted}
                onSend={room.sendChat}
              />
            </section>
            <section className={cn('min-h-0 flex-1 overflow-hidden', pane !== 'people' && 'hidden')}>
              <PeoplePanel
                people={people}
                selfId={room.selfId}
                onUploadAvatar={async (file) => {
                  try {
                    await room.uploadAvatar(file)
                  } catch (reason) {
                    setWarning(reason instanceof Error ? reason.message : 'อัปโหลดรูปไม่สำเร็จ')
                    setWarningOpen(true)
                  }
                }}
              />
            </section>
          </>
        )}
      </div>

      {adminOpen ? (
        <AdminPanel
          people={people}
          selfId={room.selfId}
          permissions={room.self.permissions}
          actorRank={room.self.rank}
          policy={room.policy}
          rankColors={room.rankColors}
          ownerSecretEnabled={room.ownerSecretEnabled}
          onClose={() => setAdminOpen(false)}
          onRank={(accountId, rank) => room.send('mod-rank', { accountId, rank })}
          onColor={(accountId, color) => room.send('mod-color', { accountId, color })}
          onRankColor={(rank, color) => room.send('mod-rank-color', { rank, color })}
          onFlag={(accountId, flag, value) => room.send('mod-flag', { accountId, flag, value })}
          onKick={(socketId) => room.send('mod-kick', { socketId })}
          onBan={(socketId) => room.send('mod-ban', { socketId })}
          onPolicy={(next) => room.send('mod-policy', next)}
          onClaim={(secret) => room.send('claim-owner', { secret })}
          onGrant={(socketId) => room.send('grant-speaker', { socketId })}
          onRevoke={(socketId) => room.send('revoke-speaker', { socketId })}
          onClearAvatar={(accountId) => room.send('clear-avatar', { accountId })}
        />
      ) : null}

      <DjPlayer
        roomId={entry.code}
        dj={room.dj}
        canControl={room.self.permissions.dj}
        onPlay={(trackId) => room.send('dj-play', { trackId })}
        onPause={() => room.send('dj-pause')}
        onSkip={(direction) => room.send('dj-skip', { direction })}
        onRemove={(trackId) => room.send('dj-remove', { trackId })}
      />
      {desktop ? null : <FollowLinks />}
      <nav className="grid grid-cols-3 border-t border-gold/30 bg-burgundy/90 pb-[max(0.4rem,env(safe-area-inset-bottom))] lg:hidden">
        <PaneButton current={pane} id="video" onSelect={setPane}>
          เวที
        </PaneButton>
        <PaneButton current={pane} id="chat" onSelect={setPane} badge={unread}>
          แชต
        </PaneButton>
        <PaneButton current={pane} id="people" onSelect={setPane}>
          ผู้คน
        </PaneButton>
      </nav>
    </main>
  )
}

function PaneButton({
  current,
  id,
  onSelect,
  badge = 0,
  children,
}: {
  current: 'video' | 'chat' | 'people'
  id: 'video' | 'chat' | 'people'
  onSelect: (id: 'video' | 'chat' | 'people') => void
  badge?: number
  children: string
}) {
  const active = current === id
  return (
    <button
      type="button"
      className={cn(
        'relative py-3 text-sm',
        active ? 'font-medium text-amber' : 'text-muted-foreground',
      )}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(id)}
    >
      {children}
      {badge > 0 ? (
        <span className="ml-1 inline-grid min-w-5 place-items-center rounded-full bg-amber px-1 text-[11px] text-ink">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function canModerate(permissions: Permissions) {
  return (
    permissions.kick ||
    permissions.ban ||
    permissions.mute ||
    permissions.manageRanks ||
    permissions.manageColors ||
    permissions.mediaPolicy
  )
}

function useJoinNotice(messages: ChatMessage[]) {
  const [notice, setNotice] = useState<string | null>(null)
  const seen = useRef(messages.length)

  useEffect(() => {
    if (messages.length <= seen.current) return
    const fresh = messages.slice(seen.current)
    seen.current = messages.length
    const latest = [...fresh].reverse().find((message) => message.kind === 'system')
    if (!latest) return
    setNotice(latest.text)
  }, [messages])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [notice])

  return notice
}

function useDesktopLayout() {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const sync = () => setDesktop(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return desktop
}
