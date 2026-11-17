import { useEffect, useMemo, useState } from 'react'
import { LogOut } from 'lucide-react'
import { AdminPanel } from '@/components/AdminPanel.tsx'
import { ChatPanel } from '@/components/ChatPanel.tsx'
import { ControlBar } from '@/components/ControlBar.tsx'
import { DjPlayer } from '@/components/DjPlayer.tsx'
import { EtfFlowCard } from '@/components/EtfFlowCard.tsx'
import { FollowLinks } from '@/components/FollowLinks.tsx'
import { NewsPanel } from '@/components/NewsPanel.tsx'
import { PeoplePanel } from '@/components/PeoplePanel.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { VideoStage } from '@/components/VideoStage.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { useRoom } from '@/hooks/useRoom.ts'
import { rememberName, storedName } from '@/lib/entry.ts'
import { acquireMedia, stopStream } from '@/lib/media.ts'
import { cleanDisplayName } from '@/lib/roomCode.ts'
import { api, clearSession, currentAccount, saveSession, type Account } from '@/lib/session.ts'
import { cn } from '@/lib/utils.ts'
import type { Participant, Permissions } from '@/types.ts'

const MAIN_ROOM = 'MAIN'
type Pane = 'room' | 'people' | 'news' | 'market'

export function MainHall() {
  const [account, setAccount] = useState<Account | null>(null)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState(storedName)
  const [authError, setAuthError] = useState<string | null>(null)
  const [enterError, setEnterError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [pane, setPane] = useState<Pane>('room')
  const [adminOpen, setAdminOpen] = useState(false)

  const room = useRoom({ roomId: MAIN_ROOM, displayName: '', localStream: stream })
  const inside = Boolean(room.selfId)

  useEffect(() => {
    void currentAccount().then(setAccount)
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

  async function authenticate(path: '/api/register' | '/api/login') {
    setAuthError(null)
    setPending(true)
    try {
      const data = await api<{ token: string; account: Account }>(path, {
        method: 'POST',
        body: JSON.stringify({ nickname, password }),
      })
      saveSession(data.token)
      setAccount(data.account)
      setPassword('')
    } catch (reason) {
      setAuthError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setPending(false)
    }
  }

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
    else setPane('room')
  }

  function leave() {
    stopStream(stream)
    setStream(null)
    room.exit()
    setPane('room')
  }

  const statusLabel = room.status === 'connected' ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ'

  return (
    <main data-testid="lobby" className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        <aside className={cn('min-h-0 flex-col gap-3 lg:flex', pane === 'market' ? 'flex' : 'hidden')}>
          <figure className="ornament-panel relative overflow-hidden rounded-2xl">
            <img
              src="/brand/fibo99-hero.webp"
              alt="FIBO99"
              width={960}
              height={960}
              className="h-36 w-full object-cover object-[center_18%] lg:h-40"
            />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-black via-black/70 to-transparent px-3 pt-10 pb-3">
              <img src="/brand/fibo99-avatar.webp" alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover shadow-[0_0_0_1px_#1a120b,0_0_0_2px_#d4b36a]" />
              <div>
                <h1 className="font-display text-2xl leading-none font-bold text-gold">FIBO99</h1>
                <p className="text-[10px] tracking-[0.22em] text-cream">คุยวง</p>
              </div>
            </figcaption>
          </figure>
          <AccountBox
            account={account}
            nickname={nickname}
            password={password}
            pending={pending}
            onNickname={setNickname}
            onPassword={setPassword}
            onLogin={() => void authenticate('/api/login')}
            onRegister={() => void authenticate('/api/register')}
            error={authError}
            onLogout={() => {
              void api('/api/logout', { method: 'POST' }).catch(() => {})
              clearSession()
              setAccount(null)
            }}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <EtfFlowCard />
          </div>
        </aside>

        <section
          data-testid="room"
          className={cn(
            'ornament-panel min-h-0 flex-col overflow-hidden rounded-2xl',
            pane === 'room' ? 'flex' : 'hidden lg:flex',
          )}
        >
          <header className="flex items-center gap-2 border-b border-gold/30 px-3 py-2">
            <p data-testid="connection-status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', room.status === 'connected' ? 'bg-teal' : 'animate-pulse bg-amber')} />
              {statusLabel}
            </p>
            <span data-testid="room-capacity" className="text-xs text-muted-foreground">
              {room.participants.length}/{room.caps.people} · ไมค์ {room.caps.speakers}
            </span>
            <div className="ml-auto flex items-center gap-2">
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
          {room.error ? <p role="alert" className="px-3 pt-2 text-sm text-rose">{room.error}</p> : null}
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
                  <Button type="submit" data-testid="enter-room" disabled={pending || room.status !== 'connected'}>
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
          {enterError ? <p role="alert" className="px-3 pb-2 text-sm text-rose">{enterError}</p> : null}
        </section>

        <aside className="contents min-h-0 lg:flex lg:flex-col lg:gap-3">
          <div className={cn('min-h-0 overflow-hidden rounded-2xl border border-gold/35 bg-card/40 lg:flex-1', pane === 'people' ? 'block' : 'hidden lg:block')}>
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
          </div>
          <div className={cn('min-h-0 lg:flex-1', pane === 'news' ? 'block' : 'hidden lg:block')}>
            <NewsPanel embedded />
          </div>
        </aside>
      </div>

      <FollowLinks />
      <nav className="grid grid-cols-4 border-t border-gold/30 bg-burgundy/90 lg:hidden">
        <PaneButton current={pane} id="room" onSelect={setPane}>ห้อง</PaneButton>
        <PaneButton current={pane} id="people" onSelect={setPane}>ผู้คน</PaneButton>
        <PaneButton current={pane} id="news" onSelect={setPane}>ข่าว</PaneButton>
        <PaneButton current={pane} id="market" onSelect={setPane}>แบรนด์</PaneButton>
      </nav>

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

function AccountBox({
  account,
  nickname,
  password,
  pending,
  error,
  onNickname,
  onPassword,
  onLogin,
  onRegister,
  onLogout,
}: {
  account: Account | null
  nickname: string
  password: string
  pending: boolean
  error: string | null
  onNickname: (value: string) => void
  onPassword: (value: string) => void
  onLogin: () => void
  onRegister: () => void
  onLogout: () => void
}) {
  if (account) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-gold/30 px-3 py-2">
        <p className="truncate text-sm">
          <span data-testid="session-name" className="font-medium text-gold">{account.nickname}</span>
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={onLogout}>
          ออกจากบัญชี
        </Button>
      </div>
    )
  }
  return (
    <form
      className="space-y-2 rounded-2xl border border-gold/30 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        onLogin()
      }}
    >
      <Input value={nickname} autoComplete="username" placeholder="ชื่อบัญชี" aria-label="ชื่อบัญชี" data-testid="account-name" onChange={(event) => onNickname(event.target.value)} />
      <Input value={password} type="password" autoComplete="current-password" placeholder="รหัสผ่าน" aria-label="รหัสผ่าน" data-testid="account-password" onChange={(event) => onPassword(event.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>เข้าสู่ระบบ</Button>
        <Button type="button" disabled={pending} data-testid="register" onClick={onRegister}>สมัคร</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-rose">{error}</p> : null}
    </form>
  )
}

function PaneButton({ current, id, onSelect, children }: { current: Pane; id: Pane; onSelect: (id: Pane) => void; children: string }) {
  const active = current === id
  return (
    <button type="button" className={cn('py-3 text-sm', active ? 'font-medium text-amber' : 'text-muted-foreground')} onClick={() => onSelect(id)}>
      {children}
    </button>
  )
}

function canModerate(permissions: Permissions) {
  return permissions.kick || permissions.ban || permissions.mute || permissions.manageRanks || permissions.mediaPolicy
}
