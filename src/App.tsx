import { useEffect, useState } from 'react'
import { Backdrop } from '@/components/Backdrop.tsx'
import { Lobby } from '@/components/Lobby.tsx'
import { RoomPage } from '@/components/RoomPage.tsx'
import { parseRoute, type AppRoute } from '@/lib/route.ts'

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute(window.location.pathname))

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return (
    <div className="relative min-h-dvh">
      <Backdrop />
      <div className="relative">{route.name === 'room' ? <RoomPage code={route.code} /> : <Lobby />}</div>
    </div>
  )
}
