import { useEffect, useState } from 'react'
import { Backdrop } from '@/components/Backdrop.tsx'
import { BackgroundMusic } from '@/components/BackgroundMusic.tsx'
import { MainHall } from '@/components/MainHall.tsx'
import { NewsPanel } from '@/components/NewsPanel.tsx'
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
        <div className="min-h-0 flex-1 overflow-hidden">{route.name === 'room' ? <RoomPage code={route.code} /> : <MainHall />}</div>
        {route.name === 'room' ? <NewsPanel /> : null}
        <BackgroundMusic />
      </div>
    </div>
  )
}
