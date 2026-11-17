import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { captureScreen, stopStream, whenTrackEnds } from '../lib/media.ts'
import { Mesh } from '../lib/mesh.ts'
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
  SignalData,
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
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const [self, setSelf] = useState<SelfProfile>(emptySelf)
  const [policy, setPolicy] = useState<RoomPolicy>({ micMinRank: 'guest', camMinRank: 'guest', screenMinRank: 'member' })
  const [remoteScreens, setRemoteScreens] = useState<Record<string, MediaStream>>({})
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [sharing, setSharing] = useState(false)
  const [screenNotice, setScreenNotice] = useState<string | null>(null)
  const [rankColors, setRankColors] = useState<Partial<Record<RankId, string>>>({})
  const [dj, setDj] = useState<DjState>(emptyDj)
  const [ownerSecretEnabled, setOwnerSecretEnabled] = useState(false)
  const [audioOverride, setAudioOverride] = useState<boolean | null>(null)
  const [videoOverride, setVideoOverride] = useState<boolean | null>(null)
  const streamKey = localStream?.id ?? ''
  const [trackedStream, setTrackedStream] = useState(streamKey)
  if (streamKey !== trackedStream) {
    setTrackedStream(streamKey)
    setAudioOverride(null)
    setVideoOverride(null)
  }
  const audioOn = (audioOverride ?? trackEnabled(localStream, 'audio')) && self.micAllowed
  const videoOn = (videoOverride ?? trackEnabled(localStream, 'video')) && self.camAllowed

  const socketRef = useRef<Socket | null>(null)
  const meshRef = useRef<Mesh | null>(null)
  const streamRef = useRef(localStream)
  const screenRef = useRef<MediaStream | null>(null)
  const sharingRef = useRef(false)
  const releaseRef = useRef<(notify: boolean) => void>(() => {})
  const flagsRef = useRef({ audio: audioOn, video: videoOn })
  const selfIdRef = useRef<string | null>(null)

  useEffect(() => {
    releaseRef.current = (notify: boolean) => {
      const current = screenRef.current
      if (!current && !sharingRef.current) return
      screenRef.current = null
      sharingRef.current = false
      setScreenStream(null)
      setSharing(false)
      stopStream(current)
      void meshRef.current?.setScreen(null)
      if (notify && socketRef.current?.connected) socketRef.current.emit('screen-state', { sharing: false })
    }
  })

  useEffect(() => {
    streamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    flagsRef.current = { audio: audioOn, video: videoOn }
  }, [audioOn, videoOn])

  useEffect(() => {
    void meshRef.current?.republish()
  }, [localStream])

  useEffect(() => {
    if (self.micAllowed) return
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false
    })
  }, [self.micAllowed])

  useEffect(() => {
    if (self.camAllowed) return
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = false
    })
  }, [self.camAllowed])

  useEffect(() => {
    let socket: Socket | null = null
    let stopped = false
    let fatal = false

    const timer = window.setTimeout(() => {
      void (async () => {
        let iceServers = Mesh.fallbackIce()
        try {
          const response = await fetch('/api/config')
          const config = (await response.json()) as { iceServers?: RTCIceServer[] }
          if (Array.isArray(config.iceServers) && config.iceServers.length > 0) {
            iceServers = config.iceServers
          }
        } catch {
          // Public STUN still lets same-network and many home calls connect.
        }
        if (stopped) return

        socket = io({ transports: ['websocket', 'polling'], reconnection: true })
        socketRef.current = socket

        const resetMesh = (id: string) => {
          meshRef.current?.close()
          meshRef.current = new Mesh(
            socket!,
            id,
            iceServers,
            () => streamRef.current,
            () => screenRef.current,
            (peerId, stream) => {
              setRemoteStreams((current) => {
                if (!stream) {
                  if (!(peerId in current)) return current
                  const next = { ...current }
                  delete next[peerId]
                  return next
                }
                if (current[peerId] === stream) return current
                return { ...current, [peerId]: stream }
              })
            },
            (peerId, stream) => {
              setRemoteScreens((current) => {
                if (!stream) {
                  if (!(peerId in current)) return current
                  const next = { ...current }
                  delete next[peerId]
                  return next
                }
                if (current[peerId] === stream) return current
                return { ...current, [peerId]: stream }
              })
            },
          )
        }

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
          if (!payload.camAllowed) {
            streamRef.current?.getVideoTracks().forEach((track) => {
              track.enabled = false
            })
            setVideoOverride(false)
          }
          if (!payload.screenAllowed) releaseRef.current(false)
        }

        socket.on('connect', () => {
          if (stopped || fatal) return
          setStatus((current) => (current === 'connected' ? current : 'connecting'))
          socket?.emit('join', {
            roomId,
            displayName,
            token: sessionToken(),
            audio: flagsRef.current.audio,
            video: flagsRef.current.video,
          })
        })

        socket.on('disconnect', () => {
          if (stopped || fatal) return
          setStatus('disconnected')
          meshRef.current?.close()
          meshRef.current = null
          setRemoteStreams({})
          setRemoteScreens({})
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
          setStatus('connected')
          applyControl(payload.self)
          resetMesh(payload.selfId)
          if (screenRef.current) socket?.emit('screen-state', { sharing: true })
          const others = payload.participants.filter((person) => person.id !== payload.selfId)
          void (async () => {
            for (const person of others) {
              if (stopped) return
              await meshRef.current?.connectTo(person.id)
            }
          })()
        })

        socket.on('participant-joined', (person: Participant) => {
          setParticipants((current) => (current.some((item) => item.id === person.id) ? current : [...current, person]))
        })

        socket.on('participant-left', ({ id }: { id: string }) => {
          setParticipants((current) => current.filter((person) => person.id !== id))
          meshRef.current?.drop(id)
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

        socket.on('screen-state', ({ id, sharing: next }: { id: string; sharing: boolean }) => {
          setParticipants((current) => current.map((person) => (person.id === id ? { ...person, sharing: next } : person)))
          if (id === selfIdRef.current && !next && screenRef.current) releaseRef.current(false)
        })

        socket.on('media-control', applyControl)
        socket.on('policy', (next: RoomPolicy) => setPolicy(next))
        socket.on('rank-colors', (colors: Partial<Record<RankId, string>>) => setRankColors(colors))
        socket.on('dj-state', (next: DjState) => setDj(next))
        socket.on('mod-error', ({ message }: { message: string }) => setModNotice(message))
        socket.on('signal', ({ from, data }: { from: string; data: SignalData }) => {
          void meshRef.current?.handleSignal(from, data)
        })
      })()
    }, 0)

    return () => {
      stopped = true
      window.clearTimeout(timer)
      stopStream(screenRef.current)
      screenRef.current = null
      sharingRef.current = false
      meshRef.current?.close()
      meshRef.current = null
      socket?.disconnect()
      socketRef.current = null
    }
  }, [displayName, roomId])

  useEffect(() => {
    if (status !== 'connected') return
    socketRef.current?.emit('media-state', { audio: audioOn, video: videoOn })
  }, [audioOn, videoOn, status])

  function toggleAudio() {
    if (!self.micAllowed) return false
    const tracks = streamRef.current?.getAudioTracks() ?? []
    if (tracks.length === 0) return false
    const next = !tracks.some((track) => track.enabled)
    for (const track of tracks) track.enabled = next
    setAudioOverride(next)
    return true
  }

  function toggleVideo() {
    if (!self.camAllowed) return false
    const tracks = streamRef.current?.getVideoTracks() ?? []
    if (tracks.length === 0) return false
    const next = !tracks.some((track) => track.enabled)
    for (const track of tracks) track.enabled = next
    setVideoOverride(next)
    return true
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
    socketRef.current?.emit('screen-state', { sharing: true })
    await meshRef.current?.setScreen(result.stream)
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
    remoteStreams,
    policy,
    rankColors,
    dj,
    ownerSecretEnabled,
    audioOn,
    videoOn,
    sharing,
    screenStream,
    remoteScreens,
    screenNotice,
    clearScreenNotice: () => setScreenNotice(null),
    hasAudio: (localStream?.getAudioTracks().length ?? 0) > 0,
    hasVideo: (localStream?.getVideoTracks().length ?? 0) > 0,
    toggleAudio,
    toggleVideo,
    toggleScreen,
    sendChat,
    send,
  }
}

function trackEnabled(stream: MediaStream | null, kind: 'audio' | 'video') {
  if (!stream) return false
  const tracks = kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()
  return tracks.some((track) => track.enabled && track.readyState === 'live')
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
