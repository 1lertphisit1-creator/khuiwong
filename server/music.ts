import { readCache, writeCache } from './db.ts'

export const DEFAULT_MUSIC_URL = 'https://www.youtube.com/watch?v=am1BdhgIdA4&list=RDam1BdhgIdA4'

export type MusicSetting = {
  musicUrl: string
  videoId: string
  listId: string | null
}

const CACHE_KEY = 'site-music'

export function musicSettings(): MusicSetting {
  const cached = readCache(CACHE_KEY)
  if (!cached) return defaultMusic()
  try {
    const parsed = JSON.parse(cached.payload) as { musicUrl?: string }
    return parseMusicUrl(parsed.musicUrl ?? '') ?? defaultMusic()
  } catch {
    return defaultMusic()
  }
}

export function saveMusicUrl(input: string) {
  const parsed = parseMusicUrl(input)
  if (!parsed) return null
  writeCache(CACHE_KEY, JSON.stringify(parsed), Date.now())
  return parsed
}

export function parseMusicUrl(input: string): MusicSetting | null {
  const text = input.trim()
  if (!text || text.length > 300) return null
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'music.youtube.com' && host !== 'm.youtube.com') {
    return null
  }
  const listRaw = url.searchParams.get('list') ?? ''
  const listId = /^[A-Za-z0-9_-]{10,48}$/.test(listRaw) ? listRaw : null
  let videoId = ''
  if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? ''
  else if (url.pathname === '/watch') videoId = url.searchParams.get('v') ?? ''
  else {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') videoId = parts[1] ?? ''
  }
  if (videoId && !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null
  if (!videoId && !listId) return null
  if (!videoId && listId) {
    return { musicUrl: `https://www.youtube.com/playlist?list=${listId}`, videoId: '', listId }
  }
  const canonical = new URL('https://www.youtube.com/watch')
  canonical.searchParams.set('v', videoId)
  if (listId) canonical.searchParams.set('list', listId)
  return { musicUrl: canonical.toString(), videoId, listId }
}

function defaultMusic(): MusicSetting {
  return parseMusicUrl(DEFAULT_MUSIC_URL)!
}
