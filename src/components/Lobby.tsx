import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { EtfFlowCard } from '@/components/EtfFlowCard.tsx'
import { FollowLinks } from '@/components/FollowLinks.tsx'
import { rememberName, stageEntry, storedName } from '@/lib/entry.ts'
import { acquireMedia } from '@/lib/media.ts'
import { cleanDisplayName, extractRoomCode } from '@/lib/roomCode.ts'
import { go } from '@/lib/route.ts'
import { api, clearSession, currentAccount, saveSession, type Account } from '@/lib/session.ts'

type LiveRoom = { id: string; people: number; speakers: number }

export function Lobby() {
  const [account, setAccount] = useState<Account | null>(null)
  const [name, setName] = useState(storedName)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'join' | 'auth' | null>(null)
  const [rooms, setRooms] = useState<LiveRoom[]>([])

  useEffect(() => {
    void currentAccount().then(setAccount)
  }, [])

  useEffect(() => {
    let stopped = false
    const load = () => {
      void fetch('/api/rooms/active')
        .then((response) => (response.ok ? response.json() : { rooms: [] }))
        .then((data: { rooms?: LiveRoom[] }) => {
          if (!stopped) setRooms(data.rooms ?? [])
        })
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, 8000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  async function authenticate(path: '/api/register' | '/api/login') {
    setError(null)
    setPending('auth')
    try {
      const data = await api<{ token: string; account: Account }>(path, {
        method: 'POST',
        body: JSON.stringify({ nickname, password }),
      })
      saveSession(data.token)
      setAccount(data.account)
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setPending(null)
    }
  }

  async function enter(nextCode: string) {
    const displayName = account?.nickname ?? cleanDisplayName(name)
    if (!displayName) {
      setError('กรอกชื่อ')
      return
    }
    setError(null)
    const media = await acquireMedia()
    rememberName(displayName)
    stageEntry({ code: nextCode, name: displayName, media })
    go(`/room/${nextCode}`)
  }

  async function createRoom() {
    if (!account) {
      setError('เข้าสู่ระบบก่อน')
      return
    }
    setPending('create')
    try {
      const data = await api<{ roomId: string }>('/api/rooms', { method: 'POST', body: '{}' })
      await enter(data.roomId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'สร้างห้องไม่สำเร็จ')
    } finally {
      setPending(null)
    }
  }

  return (
    <main data-testid="lobby" className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-8">
      <section className="grid flex-1 items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,26rem)] lg:gap-10">
        <div className="flex flex-col gap-4">
          <div className="order-2 lg:order-1">
            <EtfFlowCard />
          </div>
        <figure className="ornament-panel relative order-1 overflow-hidden rounded-[1.6rem] lg:order-2">
          <img
            src="/brand/fibo99-hero.webp"
            alt="FIBO99"
            width={960}
            height={960}
            className="h-52 w-full object-cover object-[center_16%] sm:h-80 lg:h-[34rem]"
          />
          <figcaption className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pt-16 pb-4 sm:px-6 sm:pb-6">
            <img
              src="/brand/fibo99-avatar.webp"
              alt=""
              width={56}
              height={56}
              className="h-12 w-12 rounded-full object-cover shadow-[0_0_0_1px_#1a120b,0_0_0_2px_#d4b36a] sm:h-14 sm:w-14"
            />
            <div>
              <h1 className="font-display text-3xl leading-none font-bold text-gold sm:text-5xl">FIBO99</h1>
              <p className="mt-1 text-xs tracking-[0.28em] text-cream sm:text-sm">คุยวง</p>
            </div>
          </figcaption>
        </figure>
        </div>

        <div className="ornament-panel rounded-[1.6rem] p-5 sm:p-6">
          {account ? (
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="truncate text-sm">
                <span data-testid="session-name" className="font-medium text-gold">
                  {account.nickname}
                </span>
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  void api('/api/logout', { method: 'POST' }).finally(() => {
                    clearSession()
                    setAccount(null)
                  })
                }}
              >
                ออก
              </Button>
            </div>
          ) : (
            <form
              className="mb-4 space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void authenticate('/api/login')
              }}
            >
              <Input
                value={nickname}
                autoComplete="username"
                placeholder="ชื่อบัญชี"
                aria-label="ชื่อบัญชี"
                data-testid="account-name"
                onChange={(event) => setNickname(event.target.value)}
              />
              <Input
                value={password}
                type="password"
                autoComplete="current-password"
                placeholder="รหัสผ่าน"
                aria-label="รหัสผ่าน"
                data-testid="account-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button type="submit" variant="secondary" disabled={pending !== null}>
                  เข้าสู่ระบบ
                </Button>
                <Button
                  type="button"
                  disabled={pending !== null}
                  data-testid="register"
                  onClick={() => void authenticate('/api/register')}
                >
                  {pending === 'auth' ? '...' : 'สมัคร'}
                </Button>
              </div>
            </form>
          )}

          <Button type="button" size="lg" className="w-full" disabled={pending !== null} data-testid="create-room" onClick={() => void createRoom()}>
            {pending === 'create' ? '...' : 'สร้างห้อง'}
          </Button>

          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (pending) return
              const nextCode = extractRoomCode(code)
              if (!nextCode) {
                setError('รหัสไม่ถูกต้อง')
                return
              }
              setPending('join')
              void enter(nextCode).finally(() => setPending(null))
            }}
          >
            {!account ? (
              <Input
                id="display-name"
                className="mb-2"
                value={name}
                maxLength={24}
                autoComplete="nickname"
                placeholder="ชื่อ"
                aria-label="ชื่อที่แสดง"
                onChange={(event) => setName(event.target.value)}
              />
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="room-code"
                value={code}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="รหัสห้อง"
                aria-label="รหัสห้องหรือลิงก์"
                data-testid="join-code"
                onChange={(event) => setCode(event.target.value)}
              />
              <Button type="submit" variant="secondary" size="lg" className="sm:min-w-28" disabled={pending !== null} data-testid="join-room">
                {pending === 'join' ? '...' : 'เข้าร่วม'}
              </Button>
            </div>
          </form>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-rose">
              {error}
            </p>
          ) : null}

          {rooms.length > 0 ? (
            <ul data-testid="active-rooms" className="mt-5 space-y-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-gold/25 bg-ink/50 px-3 py-2 text-left text-sm hover:border-gold/60"
                    onClick={() => {
                      setCode(room.id)
                      if (account || cleanDisplayName(name)) void enter(room.id)
                    }}
                  >
                    <span className="font-mono tracking-[0.16em]">{room.id}</span>
                    <span className="text-gold">{room.people}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <footer className="ornament-panel mt-8 overflow-hidden rounded-[1.2rem]">
        <FollowLinks className="border-t-0 bg-transparent" />
      </footer>
    </main>
  )
}
