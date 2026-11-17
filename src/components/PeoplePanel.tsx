import { Mic, MicOff, MonitorUp } from 'lucide-react'
import { AvatarFace } from '@/components/AvatarFace.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { safeColor, type Participant } from '@/types.ts'

export function PeoplePanel({
  people,
  selfId,
  onUploadAvatar,
}: {
  people: Participant[]
  selfId: string | null
  onUploadAvatar?: (file: File) => Promise<void>
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-card/30">
      <header className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <h2 className="font-display text-lg font-bold">ผู้เข้าร่วม</h2>
        <span className="text-sm text-muted-foreground" data-testid="people-count">
          {people.length} คน
        </span>
      </header>
      <ul data-testid="participant-list" className="app-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {people.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">กำลังโหลดรายชื่อ...</li>
        ) : (
          [...people]
          .sort((a, b) => b.rankLevel - a.rankLevel || a.name.localeCompare(b.name, 'th'))
          .map((person) => {
            const self = person.id === selfId
            return (
              <li
                key={person.id}
                data-testid="participant"
                data-self={self ? 'true' : 'false'}
                data-rank={person.rank}
                data-color={safeColor(person.color)}
                data-audio={person.audio ? 'true' : 'false'}
                data-speaker={person.speaker ? 'true' : 'false'}
                data-sharing={person.sharing ? 'true' : 'false'}
                className="flex items-center gap-3 rounded-xl px-2 py-2"
              >
                <AvatarFace
                  name={person.name}
                  color={person.color}
                  url={person.avatarUrl}
                  speaking={person.speaking}
                  className="h-9 w-9 text-sm"
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span style={{ color: safeColor(person.color) }}>{person.name}</span>
                  {self ? <span className="ml-2 text-xs text-amber">คุณ</span> : null}
                  <span className="ml-2 align-middle">
                    <RankBadge rank={person.rank} label={person.rankLabel} />
                  </span>
                </span>
                {self && person.accountId && onUploadAvatar ? (
                  <label className="cursor-pointer text-[11px] text-gold underline">
                    รูป
                    <input
                      data-testid="avatar-file"
                      className="sr-only"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void onUploadAvatar(file)
                      }}
                    />
                  </label>
                ) : null}
                <span className="text-muted-foreground" aria-label={person.speaker && person.audio ? 'ไมค์เปิด' : 'ไมค์ปิด'}>
                  {person.speaker && person.audio ? <Mic className="size-4 text-teal" /> : <MicOff className="size-4 text-rose" />}
                </span>
                {person.sharing ? (
                  <span className="text-amber" aria-label="กำลังแชร์หน้าจอ">
                    <MonitorUp className="size-4" />
                  </span>
                ) : null}
              </li>
            )
          })
        )}
      </ul>
    </section>
  )
}
