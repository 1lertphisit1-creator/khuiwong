import { useEffect, useState } from 'react'
import { Backdrop } from '@/components/Backdrop.tsx'
import { Lobby } from '@/components/Lobby.tsx'
import { NewsPanel } from '@/components/NewsPanel.tsx'
import { PriceTicker } from '@/components/PriceTicker.tsx'
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
      <div className="relative flex h-dvh flex-col">
        <PriceTicker />
        <div className="min-h-0 flex-1 overflow-auto">{route.name === 'room' ? <RoomPage code={route.code} /> : <Lobby />}</div>
        <NewsPanel />
      </div>
    </div>
  )
}
