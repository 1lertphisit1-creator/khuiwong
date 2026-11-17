import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'

type MusicSetting = {
  musicUrl: string
  videoId: string
  listId: string | null
}

type YtPlayer = {
  playVideo: () => void
  pauseVideo: () => void
  mute: () => void
  unMute: () => void
  isMuted: () => boolean
  setVolume: (volume: number) => void
  getPlayerState: () => number
  getVideoData: () => { title?: string }
  getPlaylist: () => string[] | null
  getPlaylistIndex: () => number
  playVideoAt: (index: number) => void
  nextVideo: () => void
  destroy: () => void
}

type YtEvent = { data: number; target: YtPlayer }

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: object) => YtPlayer
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

const DEFAULT_MUSIC: MusicSetting = {
  musicUrl: 'https://www.youtube.com/watch?v=am1BdhgIdA4&list=RDam1BdhgIdA4',
  videoId: 'am1BdhgIdA4',
  listId: 'RDam1BdhgIdA4',
}

const VOLUME_KEY = 'khuiwong.bgm.volume'
const MUTE_KEY = 'khuiwong.bgm.muted'
const PAUSE_KEY = 'khuiwong.bgm.paused'

export function BackgroundMusic() {
  const [setting, setSetting] = useState<MusicSetting>(DEFAULT_MUSIC)
  const [title, setTitle] = useState('เพลงพื้นหลัง')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(() => readFlag(MUTE_KEY))
  const [volume, setVolume] = useState(readVolume)
  const [needsTap, setNeedsTap] = useState(false)
  const [ducked, setDucked] = useState(false)
  const [inRoom, setInRoom] = useState(() => window.location.pathname.startsWith('/room/'))
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YtPlayer | null>(null)
  const volumeRef = useRef(volume)
  const mutedRef = useRef(muted)
  const pausedRef = useRef(readFlag(PAUSE_KEY))
  const duckedRef = useRef(false)
  const holdRef = useRef(false)
  const playbackRef = useRef<() => void>(() => {})

  useEffect(() => {
    volumeRef.current = volume
    mutedRef.current = muted
  }, [muted, volume])

  useEffect(() => {
    playbackRef.current = () => {
      const player = playerRef.current
      if (!player?.playVideo) return
      try {
        player.setVolume(volumeRef.current)
        if (mutedRef.current || holdRef.current) player.mute()
        else player.unMute()
        if (pausedRef.current || duckedRef.current) {
          player.pauseVideo()
          setPlaying(false)
        } else {
          player.playVideo()
        }
      } catch {
        // The iframe rejects calls until onReady.
      }
    }
  }, [])

  useEffect(() => {
    const sync = () => setInRoom(window.location.pathname.startsWith('/room/'))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    let stopped = false
    const apply = (next: MusicSetting) => {
      if (!stopped && next.videoId) setSetting(next)
      else if (!stopped && next.listId) setSetting(next)
    }
    void fetch('/api/settings')
      .then((response) => (response.ok ? (response.json() as Promise<MusicSetting>) : null))
      .then((payload) => {
        if (payload) apply(payload)
      })
      .catch(() => {})
    const socket = io({ transports: ['websocket', 'polling'], reconnection: true })
    socket.on('site-settings', apply)
    return () => {
      stopped = true
      socket.close()
    }
  }, [])

  useEffect(() => {
    const onDuck = (event: Event) => {
      const duck = Boolean((event as CustomEvent<{ duck?: boolean }>).detail?.duck)
      duckedRef.current = duck
      setDucked(duck)
      playbackRef.current()
    }
    window.addEventListener('khuiwong-bgm', onDuck)
    return () => {
      duckedRef.current = false
      window.removeEventListener('khuiwong-bgm', onDuck)
    }
  }, [])

  useEffect(() => {
    const unlock = () => {
      if (pausedRef.current) return
      if (mutedRef.current && !holdRef.current) return
      const player = playerRef.current
      if (!holdRef.current && player) {
        try {
          const state = player.getPlayerState()
          if ((state === 1 || state === 3) && !player.isMuted()) return
        } catch {
          // The player is not ready yet, so this gesture should still try to start it.
        }
      }
      holdRef.current = false
      setNeedsTap(false)
      playbackRef.current()
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    for (const name of events) window.addEventListener(name, unlock, true)
    return () => {
      for (const name of events) window.removeEventListener(name, unlock, true)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || (!setting.videoId && !setting.listId)) return
    const mount = document.createElement('div')
    host.replaceChildren(mount)
    let cancelled = false
    let player: YtPlayer | null = null
    let probe = 0

    void loadYouTube().then(() => {
      if (cancelled || !window.YT) return
      const playerVars: Record<string, string | number> = {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        loop: 1,
        origin: window.location.origin,
      }
      if (setting.listId) {
        playerVars.list = setting.listId
        playerVars.listType = 'playlist'
      } else if (setting.videoId) {
        playerVars.playlist = setting.videoId
      }
      player = new window.YT.Player(mount, {
        width: '160',
        height: '90',
        videoId: setting.videoId || undefined,
        playerVars,
        events: {
          onReady: () => {
            playerRef.current = player
            if (!player) return
            try {
              player.setVolume(volumeRef.current)
              if (mutedRef.current) player.mute()
              else player.unMute()
              if (pausedRef.current || duckedRef.current) player.pauseVideo()
              else player.playVideo()
            } catch {
              // Retry on the probe below.
            }
            probe = window.setTimeout(() => {
              if (cancelled || !player || pausedRef.current || duckedRef.current || mutedRef.current) return
              let state = -1
              let mutedNow = false
              try {
                state = player.getPlayerState()
                mutedNow = player.isMuted()
              } catch {
                state = -1
              }
              const audible = (state === 1 || state === 3) && !mutedNow
              if (audible) {
                holdRef.current = false
                setNeedsTap(false)
                return
              }
              holdRef.current = true
              try {
                player.mute()
                player.playVideo()
              } catch {
                // The next gesture calls play again.
              }
              setNeedsTap(true)
            }, 400)
          },
          onStateChange: (event: YtEvent) => {
            const current = event.target
            if (event.data === 0 && !pausedRef.current && !duckedRef.current) {
              const list = current.getPlaylist?.() ?? []
              const index = current.getPlaylistIndex?.() ?? -1
              if (!list.length || index < 0 || index >= list.length - 1) current.playVideoAt(0)
              else current.nextVideo()
            }
            if (event.data === 1) {
              const nextTitle = current.getVideoData?.()?.title?.trim()
              if (nextTitle) setTitle(nextTitle)
              setPlaying(true)
              const forced = holdRef.current && !mutedRef.current && current.isMuted()
              if (!forced) {
                holdRef.current = false
                setNeedsTap(false)
              } else {
                setNeedsTap(true)
              }
            }
            if (event.data === 2) setPlaying(false)
          },
        },
      })
      playerRef.current = player
    })

    return () => {
      cancelled = true
      window.clearTimeout(probe)
      playerRef.current = null
      try {
        player?.destroy()
      } catch {
        mount.remove()
      }
    }
  }, [setting.listId, setting.videoId])

  function togglePlay() {
    pausedRef.current = !pausedRef.current
    writeFlag(PAUSE_KEY, pausedRef.current)
    if (!pausedRef.current) holdRef.current = false
    setNeedsTap(false)
    playbackRef.current()
    setPlaying(!pausedRef.current && !duckedRef.current)
  }

  function toggleMute() {
    const next = !mutedRef.current
    mutedRef.current = next
    holdRef.current = false
    setMuted(next)
    writeFlag(MUTE_KEY, next)
    setNeedsTap(false)
    playbackRef.current()
  }

  return (
    <aside
      data-testid="bgm-player"
      className={`fixed left-3 z-20 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-gold/50 bg-[#3a1820]/95 p-2 text-cream shadow-xl ${inRoom ? 'bottom-20 lg:bottom-4' : 'bottom-3'}`}
    >
      <div className="flex items-center gap-2">
        <div ref={hostRef} data-testid="bgm-embed" className="h-[90px] w-[160px] shrink-0 overflow-hidden rounded-lg bg-ink" />
        <div className="min-w-0 flex-1">
          <p data-testid="bgm-title" className="truncate text-xs text-gold">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              data-testid="bgm-toggle"
              aria-label={playing ? 'หยุดเพลงพื้นหลัง' : 'เล่นเพลงพื้นหลัง'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gold text-ink"
              onClick={togglePlay}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              data-testid="bgm-mute"
              aria-label={muted ? 'เปิดเสียงเพลงพื้นหลัง' : 'ปิดเสียงเพลงพื้นหลัง'}
              aria-pressed={muted}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gold/40 text-gold"
              onClick={toggleMute}
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <input
              data-testid="bgm-volume"
              aria-label="ระดับเสียงเพลงพื้นหลัง"
              className="h-1.5 min-w-0 flex-1 accent-[#d4b36a]"
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value)
                volumeRef.current = next
                setVolume(next)
                try {
                  localStorage.setItem(VOLUME_KEY, String(next))
                } catch {
                  // Private mode can reject storage writes.
                }
                if (next === 0) {
                  mutedRef.current = true
                  setMuted(true)
                  writeFlag(MUTE_KEY, true)
                } else if (mutedRef.current && !holdRef.current) {
                  mutedRef.current = false
                  setMuted(false)
                  writeFlag(MUTE_KEY, false)
                }
                playbackRef.current()
              }}
            />
          </div>
        </div>
      </div>
      {needsTap ? (
        <p data-testid="bgm-hint" className="mt-2 text-center text-xs text-gold">
          🎵 แตะเพื่อเปิดเพลง
        </p>
      ) : null}
      {ducked && !needsTap ? <p className="mt-1 text-[11px] text-[#e0c17a]">พักไว้ เพราะมีเสียงในห้อง</p> : null}
    </aside>
  )
}

let youtubeLoading: Promise<void> | null = null

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve()
  if (youtubeLoading) return youtubeLoading
  youtubeLoading = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    document.head.appendChild(script)
  })
  return youtubeLoading
}

function readVolume() {
  try {
    const value = Number(localStorage.getItem(VOLUME_KEY))
    if (!Number.isFinite(value)) return 35
    return Math.min(100, Math.max(0, Math.round(value)))
  } catch {
    return 35
  }
}

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Ignore storage failures.
  }
}
