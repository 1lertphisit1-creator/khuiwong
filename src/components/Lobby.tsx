import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { FollowLinks } from '@/components/FollowLinks.tsx'
import { Logo } from '@/components/Logo.tsx'
import { rememberName, stageEntry, storedName } from '@/lib/entry.ts'
import { acquireMedia } from '@/lib/media.ts'
import { cleanDisplayName, extractRoomCode } from '@/lib/roomCode.ts'
import { go } from '@/lib/route.ts'
import { api, clearSession, currentAccount, saveSession, type Account } from '@/lib/session.ts'

export function Lobby() {
  const [account, setAccount] = useState<Account | null>(null)
  const [name, setName] = useState(storedName)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'create' | 'join' | 'auth' | null>(null)

  useEffect(() => {
    void currentAccount().then(setAccount)
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
      setError('กรอกชื่อที่แสดงก่อนเข้าห้อง สูงสุด 24 ตัวอักษร')
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
      setError('เข้าสู่ระบบก่อนสร้างห้อง จึงจะเป็นเจ้าของห้อง')
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
    <main data-testid="lobby" className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col justify-center px-4 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <Logo />
        <p className="rounded-full border border-gold/40 bg-ink/60 px-3 py-1 text-sm text-gold">เจ้าของ: FIBO99</p>
      </header>
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.618fr)_minmax(20rem,1fr)]">
        <section>
          <figure className="ornament-panel overflow-hidden rounded-[1.4rem]">
            <img
              src="/brand/fibo99-hero.webp"
              alt="มาสคอต FIBO99 ชายชราในชุดคลุมบุกันดี ถือดินสอ fibonacci 0.875"
              width={960}
              height={960}
              className="aspect-[4/3] max-h-72 w-full object-cover object-[center_18%] sm:aspect-square sm:max-h-[28rem] lg:max-h-[34rem]"
            />
          </figure>
          <h1 className="font-display mt-5 max-w-xl text-4xl leading-[1.25] font-bold sm:text-5xl">
            คุยวง
            <span className="mt-1 block text-gold">by FIBO99</span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
            ห้องสนทนาสดสำหรับวงเล็ก ๆ ข้อความ เสียง กล้อง และแชร์หน้าจอ ในบรรยากาศเรียบหรูของ FIBO99
          </p>
          <ul className="mt-6 space-y-3 text-sm sm:text-base">
            <li className="flex gap-3">
              <span className="font-display w-8 shrink-0 text-lg text-gold">01</span>
              <span>ยศติดกับชื่อบัญชี ออกแล้วเข้าใหม่ก็ยังอยู่</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display w-8 shrink-0 text-lg text-cream">02</span>
              <span>เจ้าของกับผู้ดูแลเตะ แบน ปิดแชต และล็อกกล้องได้</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display w-8 shrink-0 text-lg text-gold">03</span>
              <span>ดีเจเปิดเพลงจากเซิร์ฟเวอร์ ให้ทุกคนได้ยินตรงกัน</span>
            </li>
          </ul>
        </section>

        <div className="ornament-panel rounded-[1.6rem] p-5 sm:p-6">
          {account ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-ink px-3 py-2">
              <p className="text-sm">
                เข้าสู่ระบบในชื่อ <span data-testid="session-name" className="font-medium text-amber">{account.nickname}</span>
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
                ออกจากบัญชี
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
              <p className="text-sm font-medium">บัญชีสำหรับยศและสิทธิ์เจ้าของ</p>
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
                placeholder="รหัสผ่านอย่างน้อย 8 ตัว"
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
                  {pending === 'auth' ? 'กำลังบันทึก...' : 'สมัครชื่อ'}
                </Button>
              </div>
            </form>
          )}

          <Button type="button" size="lg" className="w-full" disabled={pending !== null} data-testid="create-room" onClick={() => void createRoom()}>
            {pending === 'create' ? 'กำลังเปิดอุปกรณ์...' : 'สร้างห้องใหม่'}
          </Button>
          {!account ? <p className="mt-2 text-xs text-muted-foreground">สร้างห้องได้เมื่อเข้าสู่ระบบแล้วเท่านั้น</p> : null}

          <div className="my-5 flex items-center gap-3 text-xs tracking-wide text-muted-foreground">
            <span className="gold-rule flex-1" />
            มีรหัสหรือลิงก์อยู่แล้ว
            <span className="gold-rule flex-1" />
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (pending) return
              const nextCode = extractRoomCode(code)
              if (!nextCode) {
                setError('รหัสห้องต้องเป็นตัวอักษรหรือตัวเลข 4–8 ตัว หรือวางลิงก์ห้อง')
                return
              }
              setPending('join')
              void enter(nextCode).finally(() => setPending(null))
            }}
          >
            {!account ? (
              <>
                <label htmlFor="display-name" className="text-sm font-medium">
                  ชื่อที่แสดงสำหรับผู้มาเยือน
                </label>
                <Input
                  id="display-name"
                  className="mt-2 mb-3"
                  value={name}
                  maxLength={24}
                  autoComplete="nickname"
                  placeholder="เช่น มิ้นท์"
                  aria-label="ชื่อที่แสดง"
                  onChange={(event) => setName(event.target.value)}
                />
              </>
            ) : null}
            <label htmlFor="room-code" className="text-sm font-medium">
              รหัสห้องหรือลิงก์
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                id="room-code"
                value={code}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="เช่น HK4N2P"
                aria-label="รหัสห้องหรือลิงก์"
                data-testid="join-code"
                onChange={(event) => setCode(event.target.value)}
              />
              <Button type="submit" variant="secondary" size="lg" className="sm:min-w-28" disabled={pending !== null} data-testid="join-room">
                {pending === 'join' ? 'กำลังเข้า...' : 'เข้าร่วม'}
              </Button>
            </div>
          </form>

          {error ? (
            <p role="alert" className="mt-3 text-sm text-rose">
              {error}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">ถ้าไม่ให้ใช้กล้องหรือไมค์ แชตข้อความยังเข้าได้</p>
          )}
        </div>
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        ยศ สีชื่อ และเพลงอยู่ในฐานข้อมูลของเซิร์ฟเวอร์ ข้อความแชตยังอยู่แค่ตอนที่มีคนในห้อง
      </p>
      <div className="ornament-panel mt-4 overflow-hidden rounded-[1.2rem]">
        <FollowLinks className="border-t-0" />
      </div>
    </main>
  )
}
