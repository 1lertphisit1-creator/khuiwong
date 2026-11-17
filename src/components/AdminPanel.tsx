import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { RANK_OPTIONS, safeColor, type Participant, type Permissions, type RankId, type RoomPolicy } from '@/types.ts'

const ASSIGNABLE: RankId[] = ['admin', 'moderator', 'vip', 'member', 'guest']

export function AdminPanel({
  people,
  selfId,
  permissions,
  actorRank,
  policy,
  rankColors,
  ownerSecretEnabled,
  onClose,
  onRank,
  onColor,
  onRankColor,
  onFlag,
  onKick,
  onBan,
  onPolicy,
  onClaim,
}: {
  people: Participant[]
  selfId: string | null
  permissions: Permissions
  actorRank: RankId
  policy: RoomPolicy
  rankColors: Partial<Record<RankId, string>>
  ownerSecretEnabled: boolean
  onClose: () => void
  onRank: (accountId: string, rank: RankId) => void
  onColor: (accountId: string, color: string | null) => void
  onRankColor: (rank: RankId, color: string) => void
  onFlag: (
    accountId: string,
    flag: 'textMuted' | 'micMuted' | 'micBlocked' | 'camBlocked' | 'screenBlocked',
    value: boolean,
  ) => void
  onKick: (socketId: string) => void
  onBan: (socketId: string) => void
  onPolicy: (policy: RoomPolicy) => void
  onClaim: (secret: string) => void
}) {
  const [secret, setSecret] = useState('')
  const [micMin, setMicMin] = useState<RankId>(policy.micMinRank)
  const [camMin, setCamMin] = useState<RankId>(policy.camMinRank)
  const [screenMin, setScreenMin] = useState<RankId>(policy.screenMinRank)
  const actorLevel = people.find((person) => person.id === selfId)?.rankLevel ?? 0

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/55" role="presentation" onClick={onClose}>
      <aside
        data-testid="admin-panel"
        role="dialog"
        aria-label="จัดการห้อง"
        className="app-scrollbar h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">จัดการห้อง</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            ปิด
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">ยศ สีชื่อ และการดูแลคนในห้อง บันทึกไว้กับบัญชีของแต่ละคน</p>

        <ul className="mt-4 space-y-3">
          {people.map((person) => {
            const self = person.id === selfId
            const lower = person.rankLevel < actorLevel
            return (
              <li key={person.id} data-testid="admin-person" data-rank={person.rank} className="rounded-2xl border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium" style={{ color: safeColor(person.color) }}>
                    {person.name}
                  </span>
                  {self ? <span className="text-xs text-amber">คุณ</span> : null}
                  <RankBadge rank={person.rank} label={person.rankLabel} />
                </div>
                {person.accountId && permissions.manageRanks && person.rank !== 'owner' && (lower || self) ? (
                  <label className="mt-3 block text-xs text-muted-foreground">
                    ยศ
                    <select
                      data-testid="rank-select"
                      className="mt-1 h-10 w-full rounded-xl border border-input bg-ink px-2 text-sm text-paper"
                      value={person.rank}
                      onChange={(event) => {
                        const rank = event.target.value as RankId
                        if (person.accountId) onRank(person.accountId, rank)
                      }}
                    >
                      {ASSIGNABLE.filter((rank) => rankLevel(rank) <= actorLevel).map((rank) => (
                        <option key={rank} value={rank}>
                          {RANK_OPTIONS.find((item) => item.id === rank)?.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {person.accountId ? 'ยศนี้เปลี่ยนจากแผงนี้ไม่ได้' : 'ผู้มาเยือนไม่มีบัญชี เตะหรือแบนได้ แต่ยศจะไม่จำ'}
                  </p>
                )}
                {person.accountId && permissions.manageColors && (lower || self) ? (
                  <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    สีชื่อ
                    <input
                      data-testid="name-color"
                      type="color"
                      value={safeColor(person.color)}
                      aria-label={`สีชื่อของ${person.name}`}
                      onChange={(event) => {
                        if (person.accountId) onColor(person.accountId, event.target.value)
                      }}
                    />
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        if (person.accountId) onColor(person.accountId, null)
                      }}
                    >
                      ใช้สียศ
                    </button>
                  </label>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {permissions.mute && lower && person.accountId ? (
                    <>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onFlag(person.accountId!, 'textMuted', !person.textMuted)}>
                        {person.textMuted ? 'เปิดแชต' : 'ปิดแชต'}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" data-testid="mute-mic" onClick={() => onFlag(person.accountId!, 'micMuted', !person.micMuted)}>
                        {person.micMuted ? 'ปลดปิดไมค์' : 'ปิดไมค์'}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onFlag(person.accountId!, 'micBlocked', !person.micBlocked)}>
                        {person.micBlocked ? 'อนุญาตไมค์' : 'ห้ามเปิดไมค์'}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => onFlag(person.accountId!, 'camBlocked', !person.camBlocked)}>
                        {person.camBlocked ? 'อนุญาตกล้อง' : 'ห้ามเปิดกล้อง'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid="block-screen"
                        onClick={() => onFlag(person.accountId!, 'screenBlocked', !person.screenBlocked)}
                      >
                        {person.screenBlocked ? 'อนุญาตแชร์จอ' : 'ห้ามแชร์จอ'}
                      </Button>
                    </>
                  ) : null}
                  {permissions.kick && lower ? (
                    <Button type="button" size="sm" variant="destructive" data-testid="kick" onClick={() => onKick(person.id)}>
                      เตะ
                    </Button>
                  ) : null}
                  {permissions.ban && lower ? (
                    <Button type="button" size="sm" variant="destructive" onClick={() => onBan(person.id)}>
                      แบน
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>

        {permissions.manageColors ? (
          <section className="mt-6">
            <h3 className="font-display text-lg font-bold">สียศเริ่มต้น</h3>
            <ul className="mt-2 space-y-2">
              {RANK_OPTIONS.filter((rank) => actorRank === 'owner' || rank.id !== 'owner').map((rank) => (
                <li key={rank.id} className="flex items-center justify-between gap-3 text-sm">
                  <RankBadge rank={rank.id} label={rank.label} />
                  <input
                    data-testid={`rank-color-${rank.id}`}
                    type="color"
                    aria-label={`สีของยศ${rank.label}`}
                    value={safeColor(rankColors[rank.id], defaultColor(rank.id))}
                    onChange={(event) => onRankColor(rank.id, event.target.value)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {permissions.mediaPolicy ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              onPolicy({ micMinRank: micMin, camMinRank: camMin, screenMinRank: screenMin })
            }}
          >
            <h3 className="font-display text-lg font-bold">ใครเปิดอุปกรณ์ได้</h3>
            <label className="block text-sm">
              เปิดไมค์ได้ตั้งแต่ยศ
              <select
                className="mt-1 h-10 w-full rounded-xl border border-input bg-ink px-2"
                value={micMin}
                onChange={(event) => setMicMin(event.target.value as RankId)}
              >
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              เปิดกล้องได้ตั้งแต่ยศ
              <select
                className="mt-1 h-10 w-full rounded-xl border border-input bg-ink px-2"
                value={camMin}
                onChange={(event) => setCamMin(event.target.value as RankId)}
              >
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              แชร์หน้าจอได้ตั้งแต่ยศ
              <select
                data-testid="screen-min-rank"
                className="mt-1 h-10 w-full rounded-xl border border-input bg-ink px-2"
                value={screenMin}
                onChange={(event) => setScreenMin(event.target.value as RankId)}
              >
                {RANK_OPTIONS.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              บันทึกกฎอุปกรณ์
            </Button>
          </form>
        ) : null}

        {ownerSecretEnabled ? (
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault()
              onClaim(secret)
              setSecret('')
            }}
          >
            <h3 className="font-display text-lg font-bold">รหัสเจ้าของระบบ</h3>
            <p className="mt-1 text-xs text-muted-foreground">ใช้รหัสจากเครื่องเซิร์ฟเวอร์เพื่อรับยศเจ้าของห้องนี้ รหัสไม่ถูกเก็บในเบราว์เซอร์</p>
            <Input
              className="mt-2"
              type="password"
              value={secret}
              autoComplete="off"
              aria-label="รหัสเจ้าของระบบ"
              onChange={(event) => setSecret(event.target.value)}
            />
            <Button type="submit" className="mt-2" variant="secondary">
              ยืนยันเป็นเจ้าของ
            </Button>
          </form>
        ) : null}
      </aside>
    </div>
  )
}

function rankLevel(rank: RankId) {
  return { owner: 60, admin: 50, moderator: 40, vip: 30, member: 20, guest: 10 }[rank]
}

function defaultColor(rank: RankId) {
  return {
    owner: '#e6a15c',
    admin: '#e07a68',
    moderator: '#7fbfb2',
    vip: '#c9a0dc',
    member: '#f6f1e7',
    guest: '#b3a898',
  }[rank]
}
