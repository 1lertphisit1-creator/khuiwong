import { useEffect, useState } from 'react'
import { Backdrop } from '@/components/Backdrop.tsx'
import { ForumPages } from '@/components/forum/ForumPages.tsx'
import { ForumShell } from '@/components/forum/ForumShell.tsx'
import { NewsPanel } from '@/components/NewsPanel.tsx'
import { RoomPage } from '@/components/RoomPage.tsx'
import { useForumSocket } from '@/hooks/useForumSocket.ts'
import { parseRoute, type AppRoute } from '@/lib/route.ts'

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname, window.location.search))
  useForumSocket()

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.pathname, window.location.search))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (route.name === 'room') {
    return (
      <div className="relative min-h-dvh">
        <Backdrop />
        <div className="relative flex h-dvh flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <RoomPage code={route.code} />
          </div>
          <NewsPanel />
        </div>
      </div>
    )
  }

  return (
    <ForumShell route={route}>
      <ForumPages route={route} />
    </ForumShell>
  )
}
