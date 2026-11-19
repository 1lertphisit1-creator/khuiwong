import { useEffect, useMemo, useState } from 'react'
import { LogOut } from 'lucide-react'
import { AdminPanel } from '@/components/AdminPanel.tsx'
import { ChatPanel } from '@/components/ChatPanel.tsx'
import { ControlBar } from '@/components/ControlBar.tsx'
import { DjPlayer } from '@/components/DjPlayer.tsx'
import { PeoplePanel } from '@/components/PeoplePanel.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { VideoStage } from '@/components/VideoStage.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useRoom } from '@/hooks/useRoom.ts'
import { rememberName, storedName } from '@/lib/entry.ts'
import { acquireMedia, stopStream } from '@/lib/media.ts'
import { cleanDisplayName } from '@/lib/roomCode.ts'
import { currentAccount, type Account } from '@/lib/session.ts'
import { cn } from '@/lib/utils.ts'
import type { Participant, Permissions } from '@/types.ts'

const MAIN_ROOM = 'MAIN'

export function MainHall() {
  const [account, setAccount] = useState<Account | null>(null)
  const [accountReady, setAccountReady] = useState(false)
  const [name, setName] = useState(storedName)
  const [enterError, setEnterError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)

  const room = useRoom({ roomId: MAIN_ROOM, displayName: '', localStream: stream })
  const inside = Boolean(room.selfId)

  useEffect(() => {
    let stopped = false
    const refresh = () => {
      void currentAccount().then((next) => {
        if (stopped) return
        setAccount(next)
        setAccountReady(true)
      })
    }
    refresh()
    window.addEventListener('khuiwong-auth', refresh)
    return () => {
      stopped = true
      window.removeEventListener('khuiwong-auth', refresh)
    }
  }, [])

  useEffect(() => {
    const micLive = room.participants.some((person) => person.speaking || (person.speaker && person.audio))
    const screenAudio = room.participants.some((person) => person.sharing && person.screenAudio)
    const duck = Boolean(room.dj.playing || micLive || screenAudio)
    window.dispatchEvent(new CustomEvent('khuiwong-bgm', { detail: { duck } }))
    return () => {
      window.dispatchEvent(new CustomEvent('khuiwong-bgm', { detail: { duck: false } }))
    }
  }, [room.dj.playing, room.participants])

  const people = useMemo<Participant[]>(() => {
    return room.participants.map((person) =>
      person.id === room.selfId ? { ...person, audio: room.audioOn, sharing: room.sharing } : person,
    )
  }, [room.audioOn, room.participants, room.selfId, room.sharing])

  async function enter() {
    const displayName = account?.nickname ?? cleanDisplayName(name)
    if (!displayName) {
      setEnterError('ตั้งชื่อก่อนเข้าคุย')
      return
    }
    setEnterError(null)
    setPending(true)
    const media = await acquireMedia()
    setWarning(media.warning)
    setStream(media.stream)
    rememberName(displayName)
    const ok = room.enter(displayName)
    setPending(false)
    if (!ok) setEnterError('ยังเชื่อมต่อไม่ได้ ลองอีกครั้ง')
  }

  function leave() {
    stopStream(stream)
    setStream(null)
    room.exit()
  }

  const statusLabel = room.status === 'connected' ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ'

  return (
    <main data-testid="live-room" className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        <section data-testid="room" className="ornament-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
          <header className="flex flex-wrap items-center gap-2 border-b border-gold/30 px-3 py-2">
            <p data-testid="connection-status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', room.status === 'connected' ? 'bg-teal' : 'animate-pulse bg-amber')} />
              {statusLabel}
            </p>
            <span data-testid="room-capacity" className="text-xs text-muted-foreground">
              {room.participants.length}/{room.caps.people} · ไมค์ {room.caps.speakers}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" className="lg:hidden" onClick={() => setPeopleOpen((value) => !value)}>
                ผู้คน
              </Button>
              {inside && room.self.rank ? <RankBadge rank={room.self.rank} label={room.self.rankLabel} /> : null}
              {inside && canModerate(room.self.permissions) ? (
                <Button type="button" size="sm" variant="secondary" data-testid="open-admin" onClick={() => setAdminOpen(true)}>
                  จัดการ
                </Button>
              ) : null}
              {inside ? (
                <Button type="button" size="sm" variant="destructive" data-testid="leave" onClick={leave}>
                  <LogOut />
                  ออก
                </Button>
              ) : null}
            </div>
          </header>
          {warning ? <p className="px-3 pt-2 text-xs text-muted-foreground">{warning}</p> : null}
          {room.error ? (
            <p role="alert" className="px-3 pt-2 text-sm text-rose">
              {room.error}
            </p>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <VideoStage
                people={people}
                selfId={room.selfId}
                localScreen={room.screenStream}
                notice={null}
                bindMic={room.bindMic}
                bindScreen={room.bindScreen}
              />
            </div>
            {inside ? (
              <ControlBar
                audioOn={room.audioOn}
                sharing={room.sharing}
                hasAudio={room.hasAudio}
                micAllowed={room.self.micAllowed}
                screenAllowed={room.self.screenAllowed}
                speaker={room.speaker}
                handRaised={room.handRaised}
                canTakeSlot={!room.speaker && room.self.permissions.mute && room.self.micAllowed}
                disabled={room.status !== 'connected'}
                screenNotice={room.screenNotice}
                onToggleAudio={room.toggleAudio}
                onRaiseHand={room.raiseHand}
                onTakeSlot={room.takeSlot}
                onToggleScreen={() => void room.toggleScreen()}
                onRetry={() => void enter()}
              />
            ) : null}
            <div className="flex min-h-48 flex-1 flex-col border-t border-gold/25">
              <ChatPanel
                messages={room.messages}
                selfId={room.selfId}
                disabled={!inside || room.status !== 'connected'}
                blocked={room.self.textMuted}
                hideComposer={!inside}
                onSend={room.sendChat}
              />
              {inside ? null : (
                <form
                  className="flex flex-col gap-2 border-t border-gold/25 p-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void enter()
                  }}
                >
                  {account ? (
                    <p className="flex flex-1 items-center text-sm text-cream">
                      เข้าเป็น <span className="ml-1 font-medium text-gold">{account.nickname}</span>
                    </p>
                  ) : (
                    <Input
                      value={name}
                      maxLength={24}
                      autoComplete="nickname"
                      placeholder="ตั้งชื่อ"
                      aria-label="ตั้งชื่อ"
                      data-testid="nickname"
                      onChange={(event) => setName(event.target.value)}
                    />
                  )}
                  <Button type="submit" data-testid="enter-room" disabled={pending || !accountReady || room.status !== 'connected'}>
                    {pending ? '...' : 'เข้าคุย'}
                  </Button>
                </form>
              )}
            </div>
          </div>
          <DjPlayer
            roomId={MAIN_ROOM}
            dj={room.dj}
            canControl={inside && room.self.permissions.dj}
            onPlay={(trackId) => room.send('dj-play', { trackId })}
            onPause={() => room.send('dj-pause')}
            onSkip={(direction) => room.send('dj-skip', { direction })}
            onRemove={(trackId) => room.send('dj-remove', { trackId })}
          />
          {enterError ? (
            <p role="alert" className="px-3 pb-2 text-sm text-rose">
              {enterError}
            </p>
          ) : null}
        </section>

        <aside className={cn('min-h-0 lg:flex lg:w-72 lg:flex-col', peopleOpen ? 'flex min-h-64 flex-1 flex-col' : 'hidden')}>
          <PeoplePanel
            people={people}
            selfId={room.selfId}
            onUploadAvatar={
              inside
                ? async (file) => {
                    await room.uploadAvatar(file)
                  }
                : undefined
            }
          />
        </aside>
      </div>

      {adminOpen && inside ? (
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
    </main>
  )
}

function canModerate(permissions: Permissions) {
  return permissions.kick || permissions.ban || permissions.mute || permissions.manageRanks || permissions.mediaPolicy
}
