import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Logo } from '@/components/Logo.tsx'
import { rememberName, stageEntry, storedName, type StagedEntry } from '@/lib/entry.ts'
import { acquireMedia } from '@/lib/media.ts'
import { cleanDisplayName } from '@/lib/roomCode.ts'
import { go } from '@/lib/route.ts'
import { currentAccount, type Account } from '@/lib/session.ts'

export function JoinGate({
  code,
  onJoined,
}: {
  code: string
  onJoined: (entry: StagedEntry) => void
}) {
  const [name, setName] = useState(storedName)
  const [account, setAccount] = useState<Account | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    void currentAccount().then((next) => {
      setAccount(next)
      if (next) setName(next.nickname)
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center text-sm text-muted-foreground">กำลังตรวจบัญชี...</main>
    )
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <form
        className="w-full max-w-md rounded-[1.6rem] border border-border bg-card/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
        onSubmit={(event) => {
          event.preventDefault()
          const displayName = account?.nickname ?? cleanDisplayName(name)
          if (!displayName) {
            setError('กรอกชื่อที่แสดงก่อนเข้าห้อง สูงสุด 24 ตัวอักษร')
            return
          }
          setPending(true)
          setError(null)
          void (async () => {
            const media = await acquireMedia()
            rememberName(displayName)
            const entry = { code, name: displayName, media }
            stageEntry(entry)
            onJoined(entry)
          })().finally(() => setPending(false))
        }}
      >
        <Logo />
        <h1 className="font-display mt-6 text-3xl font-bold">เข้าร่วมห้อง</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          รหัสห้อง <span className="font-mono tracking-[0.16em] text-paper">{code}</span>
        </p>
        <label htmlFor="gate-name" className="mt-6 block text-sm font-medium">
          {account ? 'ชื่อบัญชี' : 'ชื่อที่แสดง'}
        </label>
        <Input
          id="gate-name"
          className="mt-2"
          value={account?.nickname ?? name}
          maxLength={24}
          autoComplete="nickname"
          placeholder="เช่น อาร์ม"
          aria-label="ชื่อที่แสดง"
          readOnly={Boolean(account)}
          onChange={(event) => setName(event.target.value)}
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">ใช้ชื่อนี้ให้คนในห้องเห็น</p>
        )}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending} data-testid="confirm-join">
          {pending ? 'กำลังเปิดอุปกรณ์...' : 'เข้าร่วมห้อง'}
        </Button>
        <Button type="button" variant="ghost" className="mt-2 w-full" onClick={() => go('/')}>
          กลับหน้าแรก
        </Button>
      </form>
    </main>
  )
}
