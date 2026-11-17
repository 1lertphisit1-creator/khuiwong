import { useState } from 'react'
import { JoinGate } from '@/components/JoinGate.tsx'
import { RoomScreen } from '@/components/RoomScreen.tsx'
import { clearEntry, peekEntry, type StagedEntry } from '@/lib/entry.ts'
import { stopStream } from '@/lib/media.ts'
import { go } from '@/lib/route.ts'

export function RoomPage({ code }: { code: string }) {
  const [entry, setEntry] = useState<StagedEntry | null>(() => peekEntry(code))

  if (!entry) {
    return <JoinGate code={code} onJoined={setEntry} />
  }

  return (
    <RoomScreen
      entry={entry}
      onLeave={() => {
        stopStream(entry.media.stream)
        clearEntry()
        setEntry(null)
        go('/')
      }}
    />
  )
}
