import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { squareAvatarBlob } from '../lib/avatarImage.ts'
import { asArrayBuffer, LivePlayback, publishChunks, type RelayChunk } from '../lib/liveRelay.ts'
import { captureScreen, stopStream, whenTrackEnds } from '../lib/media.ts'
import { sessionToken } from '../lib/session.ts'
import type {
  ChatMessage,
  DjState,
  Participant,
  Permissions,
  RankId,
  RoomPolicy,
  RoomState,
  SelfProfile,
} from '../types.ts'

type Status = 'connecting' | 'connected' | 'disconnected'

const emptyPermissions: Permissions = {
  manageRanks: false,
  manageColors: false,
  kick: false,
  ban: false,
  mute: false,
  mediaPolicy: false,
  dj: false,
}

const emptySelf: SelfProfile = {
  accountId: null,
  rank: 'guest',
  rankLabel: 'ผู้มาเยือน',
  permissions: emptyPermissions,
  textMuted: false,
  micAllowed: true,
  camAllowed: true,
  screenAllowed: true,
}

const emptyDj: DjState = {
  track: null,
  playing: false,
  offsetMs: 0,
  startedAt: null,
  serverNow: Date.now(),
  playlist: [],
}

export function useRoom({
  roomId,
  displayName,
  localStream,
}: {
  roomId: string
  displayName: string
  localStream: MediaStream | null
}) {
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [modNotice, setModNotice] = useState<string | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [self, setSelf] = useState<SelfProfile>(emptySelf)
  const [policy, setPolicy] = useState<RoomPolicy>({ micMinRank: 'guest', camMinRank: 'guest', screenMinRank: 'member' })
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [sharing, setSharing] = useState(false)
  const [screenNotice, setScreenNotice] = useState<string | null>(null)
  const [rankColors, setRankColors] = useState<Partial<Record<RankId, string>>>({})
  const [dj, setDj] = useState<DjState>(emptyDj)
  const [ownerSecretEnabled, setOwnerSecretEnabled] = useState(false)
  const [caps, setCaps] = useState({ people: 200, speakers: 4 })
  const [audioOverride, setAudioOverride] = useState<boolean | null>(null)
  const streamKey = localStream?.id ?? ''
  const [trackedStream, setTrackedStream] = useState(streamKey)
  if (streamKey !== trackedStream) {
    setTrackedStream(streamKey)
    setAudioOverride(null)
  }
  const audioOn = (audioOverride ?? trackEnabled(localStream)) && self.micAllowed
  const me = participants.find((person) => person.id === selfId) ?? null

  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef(localStream)
  const screenRef = useRef<MediaStream | null>(null)
  const sharingRef = useRef(false)
  const releaseRef = useRef<(notify: boolean) => void>(() => {})
  const flagsRef = useRef({ audio: audioOn })
  const selfIdRef = useRef<string | null>(null)
  const screenPlayer = useRef<LivePlayback | null>(null)
  const micPlayers = useRef(new Map<string, LivePlayback>())
  const screenQueue = useRef<RelayChunk[]>([])
  const micQueues = useRef(new Map<string, RelayChunk[]>())

  useEffect(() => {
    releaseRef.current = (notify: boolean) => {
      const current = screenRef.current
      if (!current && !sharingRef.current) return
      screenRef.current = null
      sharingRef.current = false
      setScreenStream(null)
      setSharing(false)
      stopStream(current)
      if (notify && socketRef.current?.connected) socketRef.current.emit('screen-state', { sharing: false })
    }
  })

  useEffect(() => {
    streamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    flagsRef.current = { audio: audioOn }
  }, [audioOn])

  useEffect(() => {
    if (self.micAllowed) return
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false
    })
  }, [self.micAllowed])

  useEffect(() => {
    let socket: Socket | null = null
    let stopped = false
    let fatal = false

    const timer = window.setTimeout(() => {
      socket = io({ transports: ['websocket', 'polling'], reconnection: true })
      socketRef.current = socket

      const applyControl = (payload: {
        micAllowed: boolean
        camAllowed: boolean
        screenAllowed: boolean
        textMuted: boolean
      }) => {
        setSelf((current) => ({ ...current, ...payload }))
        if (!payload.micAllowed) {
          streamRef.current?.getAudioTracks().forEach((track) => {
            track.enabled = false
          })
          setAudioOverride(false)
        }
        if (!payload.screenAllowed) releaseRef.current(false)
      }

      const takeMic = (id: string, packet: RelayChunk) => {
        const player = micPlayers.current.get(id)
        const chunk = asArrayBuffer(packet.chunk)
        if (!chunk) return
        if (!player) {
          const queued = micQueues.current.get(id) ?? []
          queued.push({ ...packet, chunk })
          if (queued.length > 30) queued.shift()
          micQueues.current.set(id, queued)
          return
        }
        player.push(packet.gen, packet.mime, chunk)
      }

      const takeScreen = (packet: RelayChunk) => {
        const chunk = asArrayBuffer(packet.chunk)
        if (!chunk) return
        const player = screenPlayer.current
        if (!player) {
          screenQueue.current.push({ ...packet, chunk })
          if (screenQueue.current.length > 20) screenQueue.current.shift()
          return
        }
        player.push(packet.gen, packet.mime, chunk)
      }

      socket.on('connect', () => {
        if (stopped || fatal) return
        setStatus((current) => (current === 'connected' ? current : 'connecting'))
        socket?.emit('join', {
          roomId,
          displayName,
          token: sessionToken(),
          audio: flagsRef.current.audio,
          video: false,
        })
      })

      socket.on('disconnect', () => {
        if (stopped || fatal) return
        setStatus('disconnected')
      })

      socket.on('connect_error', () => {
        if (stopped || fatal) return
        setStatus('disconnected')
      })

      socket.on('room-error', ({ message }: { message: string }) => {
        fatal = true
        setError(message)
        setStatus('disconnected')
        socket?.io.reconnection(false)
        socket?.disconnect()
      })

      socket.on('kicked', ({ message }: { message: string }) => {
        fatal = true
        setError(message)
        setStatus('disconnected')
        socket?.io.reconnection(false)
      })

      socket.on('room-state', (payload: RoomState) => {
        if (stopped || fatal) return
        setError(null)
        setSelfId(payload.selfId)
        selfIdRef.current = payload.selfId
        setParticipants(payload.participants)
        setMessages(payload.messages)
        setSelf(payload.self)
        setPolicy(payload.policy)
        setRankColors(payload.rankColors)
        setDj(payload.dj)
        setOwnerSecretEnabled(payload.ownerSecretEnabled)
        if (payload.caps) setCaps(payload.caps)
        setStatus('connected')
        applyControl(payload.self)
        if (screenRef.current) {
          socket?.emit('screen-state', {
            sharing: true,
            audio: screenRef.current.getAudioTracks().some((track) => track.readyState === 'live'),
          })
        }
      })

      socket.on('participant-joined', (person: Participant) => {
        setParticipants((current) => (current.some((item) => item.id === person.id) ? current : [...current, person]))
      })

      socket.on('participant-left', ({ id }: { id: string }) => {
        setParticipants((current) => current.filter((person) => person.id !== id))
        micPlayers.current.get(id)?.close()
        micPlayers.current.delete(id)
        micQueues.current.delete(id)
      })

      socket.on('participant-updated', (person: Participant) => {
        setParticipants((current) => current.map((item) => (item.id === person.id ? person : item)))
        if (person.id === selfIdRef.current) {
          setSelf((current) => ({
            ...current,
            rank: person.rank,
            rankLabel: person.rankLabel,
            textMuted: person.textMuted,
            micAllowed: person.micAllowed,
            camAllowed: person.camAllowed,
            screenAllowed: person.screenAllowed,
            permissions: permissionsForRank(person.rank),
          }))
          applyControl({
            micAllowed: person.micAllowed,
            camAllowed: person.camAllowed,
            screenAllowed: person.screenAllowed,
            textMuted: person.textMuted,
          })
        }
      })

      socket.on('chat-message', (message: ChatMessage) => {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current
          return [...current, message].slice(-200)
        })
      })

      socket.on('media-state', ({ id, audio, video }: { id: string; audio: boolean; video: boolean }) => {
        setParticipants((current) => current.map((person) => (person.id === id ? { ...person, audio, video } : person)))
      })

      socket.on('screen-state', ({ id, sharing: next, audio }: { id: string; sharing: boolean; audio?: boolean }) => {
        setParticipants((current) =>
          current.map((person) => (person.id === id ? { ...person, sharing: next, screenAudio: Boolean(audio && next) } : person)),
        )
        if (id === selfIdRef.current && !next && screenRef.current) releaseRef.current(false)
        if (!next) {
          screenPlayer.current?.close()
          screenPlayer.current = null
          screenQueue.current = []
        }
      })

      socket.on('mic-chunk', (packet: RelayChunk) => takeMic(packet.id, packet))
      socket.on('mic-end', ({ id }: { id: string }) => {
        micPlayers.current.get(id)?.close()
        micPlayers.current.delete(id)
        micQueues.current.delete(id)
      })
      socket.on('screen-chunk', (packet: RelayChunk) => takeScreen(packet))
      socket.on('screen-end', () => {
        screenQueue.current = []
      })

      socket.on('media-control', applyControl)
      socket.on('policy', (next: RoomPolicy) => setPolicy(next))
      socket.on('rank-colors', (colors: Partial<Record<RankId, string>>) => setRankColors(colors))
      socket.on('dj-state', (next: DjState) => setDj(next))
      socket.on('mod-error', ({ message }: { message: string }) => setModNotice(message))
    }, 0)

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stopStream(screenRef.current)
      screenRef.current = null
      sharingRef.current = false
      screenPlayer.current?.close()
      for (const player of micPlayers.current.values()) player.close()
      micPlayers.current.clear()
      socket?.disconnect()
      socketRef.current = null
    }
  }, [displayName, roomId])

  useEffect(() => {
    if (status !== 'connected') return
    socketRef.current?.emit('media-state', { audio: audioOn, video: false })
  }, [audioOn, status])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket || status !== 'connected' || !me?.speaker || !audioOn) return
    const stream = streamRef.current
    if (!stream || stream.getAudioTracks().length === 0) return
    return publishChunks(socket, 'mic-chunk', stream, 'audio')
  }, [audioOn, me?.speaker, status, localStream])

  useEffect(() => {
    const socket = socketRef.current
    const confirmed = me?.sharing && screenStream
    if (!socket || status !== 'connected' || !confirmed || !screenStream) return
    return publishChunks(socket, 'screen-chunk', screenStream, 'video')
  }, [me?.sharing, screenStream, status])

  useEffect(() => {
    const socket = socketRef.current
    const stream = streamRef.current
    if (!socket || status !== 'connected' || !me?.speaker || !audioOn || !stream) return
    const context = new AudioContext()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let last = false
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let energy = 0
      for (const value of samples) {
        const centered = (value - 128) / 128
        energy += centered * centered
      }
      const speaking = Math.sqrt(energy / samples.length) > 0.045
      if (speaking === last) return
      last = speaking
      socket.emit('voice', { speaking })
    }, 160)
    return () => {
      window.clearInterval(timer)
      source.disconnect()
      void context.close()
      if (last) socket.emit('voice', { speaking: false })
    }
  }, [audioOn, me?.speaker, status, localStream])

  const bindMic = useCallback((id: string, element: HTMLAudioElement | null) => {
    const previous = micPlayers.current.get(id)
    previous?.close()
    micPlayers.current.delete(id)
    if (!element) return
    const player = new LivePlayback(element)
    micPlayers.current.set(id, player)
    const queued = micQueues.current.get(id) ?? []
    micQueues.current.delete(id)
    for (const packet of queued) {
      const chunk = asArrayBuffer(packet.chunk)
      if (chunk) player.push(packet.gen, packet.mime, chunk)
    }
  }, [])

  const bindScreen = useCallback((element: HTMLVideoElement | null) => {
    screenPlayer.current?.close()
    screenPlayer.current = null
    if (!element) return
    const player = new LivePlayback(element)
    screenPlayer.current = player
    const queued = screenQueue.current.splice(0)
    for (const packet of queued) {
      const chunk = asArrayBuffer(packet.chunk)
      if (chunk) player.push(packet.gen, packet.mime, chunk)
    }
  }, [])

  function toggleAudio() {
    if (!self.micAllowed || !me?.speaker) return false
    const tracks = streamRef.current?.getAudioTracks() ?? []
    if (tracks.length === 0) return false
    const next = !tracks.some((track) => track.enabled)
    for (const track of tracks) track.enabled = next
    setAudioOverride(next)
    return true
  }

  function raiseHand(raised: boolean) {
    socketRef.current?.emit('raise-hand', { raised })
  }

  function takeSlot() {
    socketRef.current?.emit('take-slot')
  }

  async function uploadAvatar(file: File) {
    const blob = await squareAvatarBlob(file)
    const headers = new Headers({ 'Content-Type': 'image/webp' })
    const token = sessionToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch('/api/account/avatar', { method: 'POST', body: blob, headers })
    const data = (await response.json().catch(() => ({}))) as { message?: string }
    if (!response.ok) throw new Error(data.message || 'อัปโหลดรูปไม่สำเร็จ')
    socketRef.current?.emit('avatar-refresh')
  }

  async function toggleScreen() {
    if (!self.screenAllowed && !screenRef.current) {
      setScreenNotice('ยศนี้แชร์หน้าจอไม่ได้')
      return false
    }
    if (screenRef.current) {
      releaseRef.current(true)
      return true
    }
    const result = await captureScreen()
    if (!result.stream) {
      if (result.warning) setScreenNotice(result.warning)
      return false
    }
    const video = result.stream.getVideoTracks()[0]
    if (video) {
      whenTrackEnds(video, () => {
        if (screenRef.current?.getVideoTracks().some((track) => track.id === video.id)) releaseRef.current(true)
      })
    }
    screenRef.current = result.stream
    sharingRef.current = true
    setScreenStream(result.stream)
    setSharing(true)
    setScreenNotice(null)
    socketRef.current?.emit('screen-state', {
      sharing: true,
      audio: result.stream.getAudioTracks().some((track) => track.readyState === 'live'),
    })
    return true
  }

  function sendChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed || self.textMuted || !socketRef.current?.connected) return false
    socketRef.current.emit('chat', { text: trimmed })
    return true
  }

  function send(event: string, payload?: object) {
    socketRef.current?.emit(event, payload ?? {})
  }

  return {
    status,
    error,
    modNotice,
    clearModNotice: () => setModNotice(null),
    selfId,
    self,
    participants,
    messages,
    policy,
    rankColors,
    dj,
    ownerSecretEnabled,
    caps,
    audioOn,
    sharing,
    screenStream,
    screenNotice,
    speaker: Boolean(me?.speaker),
    handRaised: Boolean(me?.handRaised),
    clearScreenNotice: () => setScreenNotice(null),
    hasAudio: (localStream?.getAudioTracks().length ?? 0) > 0,
    toggleAudio,
    toggleScreen,
    raiseHand,
    takeSlot,
    uploadAvatar,
    bindMic,
    bindScreen,
    sendChat,
    send,
  }
}

function trackEnabled(stream: MediaStream | null) {
  if (!stream) return false
  return stream.getAudioTracks().some((track) => track.enabled && track.readyState === 'live')
}

function permissionsForRank(rank: RankId): Permissions {
  const level = { owner: 60, admin: 50, moderator: 40, vip: 30, member: 20, guest: 10 }[rank]
  return {
    manageRanks: level >= 50,
    manageColors: level >= 50,
    kick: level >= 40,
    ban: level >= 50,
    mute: level >= 40,
    mediaPolicy: level >= 50,
    dj: level >= 30,
  }
}
