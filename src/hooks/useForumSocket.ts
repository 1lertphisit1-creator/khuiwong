import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { isForumEvent, isForumOnline, publishForum } from '@/lib/forum.ts'
import { isPriceBoard, publishPrices } from '@/lib/prices.ts'
import { sessionToken } from '@/lib/session.ts'

export function useForumSocket() {
  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'], reconnection: true })
    const announce = () => socket.emit('forum-presence', { token: sessionToken() })
    socket.on('connect', announce)
    socket.on('forum-event', (payload: unknown) => {
      if (isForumEvent(payload)) publishForum(payload)
    })
    socket.on('forum-online', (payload: unknown) => {
      if (isForumOnline(payload)) publishForum({ type: 'online', online: payload })
    })
    const armPrices = () => {
      socket.on('prices', (payload: unknown) => {
        if (isPriceBoard(payload)) publishPrices(payload)
      })
    }
    const priceWait = window.setTimeout(armPrices, 400)
    window.addEventListener('khuiwong-auth', announce)
    return () => {
      window.clearTimeout(priceWait)
      window.removeEventListener('khuiwong-auth', announce)
      socket.close()
    }
  }, [])
}
