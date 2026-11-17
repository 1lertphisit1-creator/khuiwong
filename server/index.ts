import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import busboy from 'busboy'
import express, { type Request, type Response } from 'express'
import { Server, type Socket } from 'socket.io'
import {
  accountFromToken,
  cleanNickname,
  cleanPassword,
  ensureSiteOwner,
  grantSiteOwnerRoom,
  isSiteOwnerAccount,
  loginAccount,
  logoutToken,
  nicknameKey,
  registerAccount,
} from './auth.ts'
import {
  addBan,
  countDjTracks,
  deleteDjTrack,
  findAccountByKey,
  getDjTrack,
  getMember,
  dataDir,
  getPlayback,
  getRankColors,
  getRoom,
  insertDjTrack,
  insertRoom,
  isAccountBanned,
  isGuestBanned,
  listDjTracks,
  nextDjPosition,
  savePlayback,
  setRankColor,
  setRoomOwner,
  setRoomPolicy,
  updateMemberColor,
  updateMemberFlags,
  updateMemberRank,
  upsertMember,
  type DjPlaybackRow,
} from './db.ts'
import {
  ASSIGNABLE_RANKS,
  cleanHexColor,
  isRankId,
  outranks,
  permissionsFor,
  rankLabel,
  rankLevel,
  type Permissions,
  type RankId,
} from './ranks.ts'

const PORT = Number(process.env.PORT) || 4721
const MAX_PARTICIPANTS = 200
const MAX_SPEAKERS = 4
const MAX_MESSAGES = 200
const MAX_TRACKS = 20
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024
const isProd = process.env.NODE_ENV !== 'development'
const uploadDir = path.join(dataDir(), 'uploads')
const avatarDir = path.join(dataDir(), 'avatars')
mkdirSync(uploadDir, { recursive: true })
mkdirSync(avatarDir, { recursive: true })
const avatarVersions = new Map<string, number>()

type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

type PublicParticipant = {
  id: string
  accountId: string | null
  name: string
  rank: RankId
  rankLabel: string
  rankLevel: number
  color: string
  audio: boolean
  video: boolean
  sharing: boolean
  textMuted: boolean
  micMuted: boolean
  micBlocked: boolean
  camBlocked: boolean
  screenBlocked: boolean
  micAllowed: boolean
  camAllowed: boolean
  screenAllowed: boolean
  handRaised: boolean
  speaker: boolean
  speaking: boolean
  avatarUrl: string | null
}

type ChatMessage = {
  id: string
  kind: 'chat' | 'system'
  from?: string
  name: string
  text: string
  at: number
  rank?: RankId
  rankLabel?: string
  color?: string
  avatarUrl?: string | null
}

type LiveUser = {
  socketId: string
  accountId: string | null
  name: string
  rank: RankId
  nameColor: string | null
  textMuted: boolean
  micMuted: boolean
  micBlocked: boolean
  camBlocked: boolean
  screenBlocked: boolean
  guestKey: string | null
  audio: boolean
  video: boolean
  sharing: boolean
  handRaised: boolean
  speaker: boolean
  speaking: boolean
  raisedAt: number
}

type LiveRoom = {
  participants: Map<string, LiveUser>
  messages: ChatMessage[]
  policy: { micMinRank: RankId; camMinRank: RankId; screenMinRank: RankId }
  rankColors: Record<RankId, string>
}

type SignalData = {
  description?: { type: string; sdp?: string }
  candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null }
}

type DjSnapshot = {
  track: { id: string; title: string; url: string } | null
  playing: boolean
  offsetMs: number
  startedAt: number | null
  serverNow: number
  playlist: { id: string; title: string }[]
}

type ClientToServer = {
  join: (payload: {
    roomId?: string
    displayName?: string
    token?: string
    audio?: boolean
    video?: boolean
  }) => void
  chat: (payload: { text?: string }) => void
  signal: (payload: { to?: string; data?: SignalData }) => void
  'media-state': (payload: { audio?: boolean; video?: boolean }) => void
  'screen-state': (payload: { sharing?: boolean }) => void
  'raise-hand': (payload: { raised?: boolean }) => void
  'take-slot': () => void
  'grant-speaker': (payload: { socketId?: string }) => void
  'revoke-speaker': (payload: { socketId?: string }) => void
  'voice': (payload: { speaking?: boolean }) => void
  'mic-chunk': (payload: { gen?: number; seq?: number; mime?: string; chunk?: unknown }) => void
  'mic-end': (payload: { gen?: number }) => void
  'screen-chunk': (payload: { gen?: number; seq?: number; mime?: string; chunk?: unknown }) => void
  'screen-end': (payload: { gen?: number }) => void
  'clear-avatar': (payload: { accountId?: string }) => void
  'avatar-refresh': () => void
  'mod-rank': (payload: { accountId?: string; rank?: string }) => void
  'mod-color': (payload: { accountId?: string; color?: string | null }) => void
  'mod-rank-color': (payload: { rank?: string; color?: string }) => void
  'mod-flag': (payload: { accountId?: string; flag?: string; value?: boolean }) => void
  'mod-kick': (payload: { socketId?: string }) => void
  'mod-ban': (payload: { socketId?: string }) => void
  'mod-policy': (payload: { micMinRank?: string; camMinRank?: string; screenMinRank?: string }) => void
  'claim-owner': (payload: { secret?: string }) => void
  'dj-play': (payload: { trackId?: string }) => void
  'dj-pause': () => void
  'dj-skip': (payload: { direction?: number }) => void
  'dj-remove': (payload: { trackId?: string }) => void
}

type ServerToClient = {
  'room-state': (payload: {
    selfId: string
    roomId: string
    participants: PublicParticipant[]
    messages: ChatMessage[]
    self: {
      accountId: string | null
      rank: RankId
      rankLabel: string
      permissions: Permissions
      textMuted: boolean
      micAllowed: boolean
      camAllowed: boolean
      screenAllowed: boolean
    }
    policy: { micMinRank: RankId; camMinRank: RankId; screenMinRank: RankId }
    rankColors: Record<RankId, string>
    dj: DjSnapshot
    ownerSecretEnabled: boolean
    caps: { people: number; speakers: number }
  }) => void
  'mic-chunk': (payload: { id: string; gen: number; seq: number; mime: string; chunk: Buffer }) => void
  'mic-end': (payload: { id: string; gen: number }) => void
  'screen-chunk': (payload: { id: string; gen: number; seq: number; mime: string; chunk: Buffer }) => void
  'screen-end': (payload: { id: string; gen: number }) => void
  'participant-joined': (participant: PublicParticipant) => void
  'participant-left': (payload: { id: string }) => void
  'participant-updated': (participant: PublicParticipant) => void
  'chat-message': (message: ChatMessage) => void
  'media-state': (payload: { id: string; audio: boolean; video: boolean }) => void
  'screen-state': (payload: { id: string; sharing: boolean }) => void
  'media-control': (payload: { micAllowed: boolean; camAllowed: boolean; screenAllowed: boolean; textMuted: boolean }) => void
  policy: (payload: { micMinRank: RankId; camMinRank: RankId; screenMinRank: RankId }) => void
  'rank-colors': (payload: Record<RankId, string>) => void
  'dj-state': (payload: DjSnapshot) => void
  signal: (payload: { from: string; data: SignalData }) => void
  'room-error': (payload: { message: string }) => void
  'mod-error': (payload: { message: string }) => void
  kicked: (payload: { message: string }) => void
}

type SocketData = {
  roomId?: string
  name?: string
  accountId?: string | null
  suppressLeave?: boolean
}

type AppSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>
type AppServer = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>

function loadEnvFile() {
  const file = path.resolve(process.cwd(), '.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function buildIceServers(): IceServer[] {
  const servers: IceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]
  const urls = (process.env.TURN_URLS || process.env.TURN_URL || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  if (urls.length === 0) return servers
  const turn: IceServer = { urls: urls.length === 1 ? urls[0]! : urls }
  const username = process.env.TURN_USERNAME?.trim()
  const credential = process.env.TURN_CREDENTIAL?.trim()
  if (username) turn.username = username
  if (credential) turn.credential = credential
  servers.push(turn)
  return servers
}

function withoutControls(input: string) {
  let out = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) continue
    out += char
  }
  return out
}

function cleanName(input: unknown) {
  if (typeof input !== 'string') return null
  const name = withoutControls(input).trim().replace(/\s+/g, ' ')
  const chars = [...name]
  if (chars.length < 1 || chars.length > 24) return null
  return chars.join('')
}

function cleanRoomId(input: unknown) {
  if (typeof input !== 'string') return null
  const id = input.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(id)) return null
  return id
}

function cleanText(input: unknown) {
  if (typeof input !== 'string') return null
  const text = withoutControls(input).trim()
  const chars = [...text]
  if (chars.length < 1) return null
  return chars.slice(0, 500).join('')
}

function isSignal(data: unknown): data is SignalData {
  if (!data || typeof data !== 'object') return false
  const value = data as SignalData
  if (value.description && typeof value.description === 'object') {
    const desc = value.description
    if (desc.type !== 'offer' && desc.type !== 'answer') return false
    if (typeof desc.sdp !== 'string' || desc.sdp.length > 100_000) return false
    return true
  }
  if (value.candidate && typeof value.candidate === 'object') {
    if (typeof value.candidate.candidate !== 'string') return false
    if (value.candidate.candidate.length > 4_000) return false
    return true
  }
  return false
}

function clientAddress(address: string | undefined) {
  return (address ?? '').replace(/^::ffff:/, '') || 'unknown'
}

function hashIp(ip: string) {
  const salt = process.env.IP_HASH_SALT || 'khuiwong-ip'
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex')
}

function secretMatches(input: string) {
  const expected = process.env.OWNER_SECRET
  if (!expected || !input) return false
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(input).digest()
  return timingSafeEqual(a, b)
}

function bearer(req: Request) {
  const header = req.header('authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
}

loadEnvFile()

const rooms = new Map<string, LiveRoom>()
const lastChatAt = new Map<string, number>()

function ensureRoomRecord(roomId: string, ownerAccountId: string | null) {
  if (!getRoom(roomId)) {
    insertRoom(roomId, ownerAccountId)
    grantSiteOwnerRoom(roomId)
  }
}

function canCommand(actor: LiveUser, target: LiveUser) {
  if (actor.accountId && target.accountId && actor.accountId === target.accountId) return false
  if (isSiteOwnerAccount(target.accountId)) return false
  if (isSiteOwnerAccount(actor.accountId)) return true
  return outranks(actor.rank, target.rank)
}

function openLive(roomId: string) {
  const existing = rooms.get(roomId)
  if (existing) return existing
  const row = getRoom(roomId)
  if (!row) return null
  const micMinRank = isRankId(row.mic_min_rank) ? row.mic_min_rank : 'guest'
  const camMinRank = isRankId(row.cam_min_rank) ? row.cam_min_rank : 'guest'
  const screenMinRank = isRankId(row.screen_min_rank) ? row.screen_min_rank : 'member'
  const live: LiveRoom = {
    participants: new Map(),
    messages: [],
    policy: { micMinRank, camMinRank, screenMinRank },
    rankColors: getRankColors(roomId),
  }
  rooms.set(roomId, live)
  return live
}

function canUseMic(live: LiveRoom, user: LiveUser) {
  if (user.micMuted || user.micBlocked) return false
  return rankLevel(user.rank) >= rankLevel(live.policy.micMinRank)
}

function speakerCount(live: LiveRoom) {
  let count = 0
  for (const user of live.participants.values()) if (user.speaker) count += 1
  return count
}

function avatarFile(accountId: string) {
  return path.join(avatarDir, `${accountId}.webp`)
}

function avatarUrlFor(accountId: string | null) {
  if (!accountId || !/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) return null
  let version = avatarVersions.get(accountId)
  if (version === undefined) {
    const file = avatarFile(accountId)
    if (!existsSync(file)) version = 0
    else version = Math.floor(statSync(file).mtimeMs)
    avatarVersions.set(accountId, version)
  }
  if (!version) return null
  return `/api/avatars/${accountId}?v=${version}`
}

function isWebp(buf: Buffer) {
  return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP'
}

function canUseCam(live: LiveRoom, user: LiveUser) {
  if (user.camBlocked) return false
  return rankLevel(user.rank) >= rankLevel(live.policy.camMinRank)
}

function canShare(live: LiveRoom, user: LiveUser) {
  if (user.screenBlocked) return false
  return rankLevel(user.rank) >= rankLevel(live.policy.screenMinRank)
}

function enforceMedia(live: LiveRoom, user: LiveUser) {
  if (!canUseMic(live, user)) user.audio = false
  if (!canUseCam(live, user)) user.video = false
  if (!canShare(live, user)) user.sharing = false
}

function toPublic(live: LiveRoom, user: LiveUser): PublicParticipant {
  return {
    id: user.socketId,
    accountId: user.accountId,
    name: user.name,
    rank: user.rank,
    rankLabel: rankLabel(user.rank),
    rankLevel: rankLevel(user.rank),
    color: user.nameColor ?? live.rankColors[user.rank],
    audio: user.audio && canUseMic(live, user),
    video: user.video && canUseCam(live, user),
    sharing: user.sharing && canShare(live, user),
    textMuted: user.textMuted,
    micMuted: user.micMuted,
    micBlocked: user.micBlocked,
    camBlocked: user.camBlocked,
    screenBlocked: user.screenBlocked,
    micAllowed: canUseMic(live, user),
    camAllowed: canUseCam(live, user),
    screenAllowed: canShare(live, user),
    handRaised: user.handRaised && !user.speaker,
    speaker: user.speaker,
    speaking: user.speaking && user.speaker && user.audio,
    avatarUrl: avatarUrlFor(user.accountId),
  }
}

function sortedParticipants(live: LiveRoom) {
  return [...live.participants.values()]
    .map((user) => toPublic(live, user))
    .sort((a, b) => b.rankLevel - a.rankLevel || a.name.localeCompare(b.name, 'th'))
}

function makeMessage(
  kind: ChatMessage['kind'],
  text: string,
  name: string,
  extra?: Partial<ChatMessage>,
): ChatMessage {
  return {
    id: randomBytes(9).toString('base64url'),
    kind,
    name,
    text,
    at: Date.now(),
    ...extra,
  }
}

function pushMessage(io: AppServer, roomId: string, live: LiveRoom, message: ChatMessage) {
  live.messages.push(message)
  if (live.messages.length > MAX_MESSAGES) {
    live.messages.splice(0, live.messages.length - MAX_MESSAGES)
  }
  io.to(roomId).emit('chat-message', message)
}

function broadcastUser(io: AppServer, roomId: string, live: LiveRoom, user: LiveUser) {
  enforceMedia(live, user)
  const participant = toPublic(live, user)
  io.to(roomId).emit('participant-updated', participant)
  io.to(user.socketId).emit('media-control', {
    micAllowed: participant.micAllowed,
    camAllowed: participant.camAllowed,
    screenAllowed: participant.screenAllowed,
    textMuted: participant.textMuted,
  })
  io.to(roomId).emit('media-state', {
    id: user.socketId,
    audio: participant.audio,
    video: participant.video,
  })
  io.to(roomId).emit('screen-state', {
    id: user.socketId,
    sharing: participant.sharing,
  })
}

function syncAccountUser(roomId: string, user: LiveUser) {
  if (!user.accountId) return
  const room = getRoom(roomId)
  const member = getMember(roomId, user.accountId)
  if (!room || !member || !isRankId(member.rank)) return
  if (isSiteOwnerAccount(user.accountId)) {
    user.rank = 'owner'
    if (member.rank !== 'owner') updateMemberRank(roomId, user.accountId, 'owner')
  } else {
    user.rank = room.owner_account_id === user.accountId ? 'owner' : member.rank
  }
  user.nameColor = member.name_color
  user.textMuted = member.text_muted === 1
  user.micMuted = member.mic_muted === 1
  user.micBlocked = member.mic_blocked === 1
  user.camBlocked = member.cam_blocked === 1
  user.screenBlocked = member.screen_blocked === 1
  if (!canUseMicFrom(user, roomId)) user.audio = false
  if (user.camBlocked) user.video = false
  if (user.screenBlocked) user.sharing = false
}

function canUseMicFrom(user: LiveUser, roomId: string) {
  const live = rooms.get(roomId)
  if (!live) return !user.micMuted && !user.micBlocked
  return canUseMic(live, user)
}

function reloadRoomPolicy(roomId: string) {
  const live = rooms.get(roomId)
  const row = getRoom(roomId)
  if (!live || !row) return
  live.policy = {
    micMinRank: isRankId(row.mic_min_rank) ? row.mic_min_rank : 'guest',
    camMinRank: isRankId(row.cam_min_rank) ? row.cam_min_rank : 'guest',
    screenMinRank: isRankId(row.screen_min_rank) ? row.screen_min_rank : 'member',
  }
  live.rankColors = getRankColors(roomId)
}

function findLiveByAccount(live: LiveRoom, accountId: string) {
  for (const user of live.participants.values()) {
    if (user.accountId === accountId) return user
  }
  return undefined
}

function actorContext(socket: AppSocket) {
  const roomId = socket.data.roomId
  if (!roomId) return null
  const live = rooms.get(roomId)
  const user = live?.participants.get(socket.id)
  if (!live || !user) return null
  return { roomId, live, user }
}

function djSnapshot(roomId: string): DjSnapshot {
  const playback = getPlayback(roomId)
  const tracks = listDjTracks(roomId)
  const current = playback?.track_id ? getDjTrack(playback.track_id) : undefined
  const playing = playback?.playing === 1 && Boolean(current)
  return {
    track: current ? { id: current.id, title: current.title, url: `/api/dj/tracks/${current.id}/audio` } : null,
    playing,
    offsetMs: playback?.offset_ms ?? 0,
    startedAt: playing ? (playback?.started_at ?? null) : null,
    serverNow: Date.now(),
    playlist: tracks.map((track) => ({ id: track.id, title: track.title })),
  }
}

function playedOffset(row: DjPlaybackRow) {
  if (row.playing !== 1 || row.started_at == null) return row.offset_ms
  return Math.max(0, row.offset_ms + (Date.now() - row.started_at))
}

function emitDj(io: AppServer, roomId: string) {
  io.to(roomId).emit('dj-state', djSnapshot(roomId))
}

function decodeUploadName(filename: string) {
  if (!/[\u0080-\u00ff]/.test(filename)) return filename
  const repaired = Buffer.from(filename, 'latin1').toString('utf8')
  if (repaired.includes('\uFFFD')) return filename
  return repaired
}

function cleanTitle(filename: string) {
  const base = path.basename(filename).replace(/\.[^.]+$/, '')
  const cleaned = withoutControls(base).trim().replace(/\s+/g, ' ')
  const chars = [...cleaned]
  if (chars.length === 0) return 'เพลงไม่มีชื่อ'
  return chars.slice(0, 80).join('')
}

function audioExtension(filename: string, mime: string) {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.mp3') || mime === 'audio/mpeg') return '.mp3'
  if (lower.endsWith('.wav') || mime === 'audio/wav' || mime === 'audio/x-wav') return '.wav'
  if (lower.endsWith('.ogg') || mime === 'audio/ogg') return '.ogg'
  if (lower.endsWith('.webm') || mime === 'audio/webm') return '.webm'
  if (lower.endsWith('.m4a') || mime === 'audio/mp4') return '.m4a'
  return null
}

function removeFromRoom(io: AppServer, socket: AppSocket) {
  const roomId = socket.data.roomId
  if (!roomId) return
  const live = rooms.get(roomId)
  socket.data.roomId = undefined
  socket.leave(roomId)
  if (!live) return
  const existing = live.participants.get(socket.id)
  live.participants.delete(socket.id)
  if (existing && !socket.data.suppressLeave) {
    pushMessage(io, roomId, live, makeMessage('system', `${existing.name} ออกจากห้อง`, existing.name))
    socket.to(roomId).emit('participant-left', { id: socket.id })
    console.log(`[room] leave ${roomId} size=${live.participants.size}`)
  } else if (existing) {
    socket.to(roomId).emit('participant-left', { id: socket.id })
  }
  if (live.participants.size === 0) rooms.delete(roomId)
}

function roomStatePayload(socket: AppSocket, roomId: string, live: LiveRoom, user: LiveUser) {
  const self = toPublic(live, user)
  return {
    selfId: socket.id,
    roomId,
    participants: sortedParticipants(live),
    messages: live.messages,
    self: {
      accountId: user.accountId,
      rank: user.rank,
      rankLabel: rankLabel(user.rank),
      permissions: permissionsFor(user.rank),
      textMuted: self.textMuted,
      micAllowed: self.micAllowed,
      camAllowed: self.camAllowed,
      screenAllowed: self.screenAllowed,
    },
    policy: live.policy,
    rankColors: live.rankColors,
    dj: djSnapshot(roomId),
      ownerSecretEnabled: Boolean(process.env.OWNER_SECRET),
      caps: { people: MAX_PARTICIPANTS, speakers: MAX_SPEAKERS },
    }
}

async function main() {
  ensureSiteOwner()
  const app = express()
  const httpServer = createServer(app)
  const io: AppServer = new Server(httpServer, {
    cors: { origin: true },
    maxHttpBufferSize: 1_000_000,
  })

  app.disable('x-powered-by')
  app.use((req, _res, next) => {
    if ((req.url ?? '').startsWith('/socket.io')) return
    next()
  })
  app.use(express.json({ limit: '32kb' }))

  const health = (_req: Request, res: Response) => {
    res.status(200).json({ ok: true })
  }
  app.get('/api/health', health)
  app.get('/health', health)

  app.get('/api/config', (_req, res) => {
    res.json({
      iceServers: buildIceServers(),
      maxParticipants: MAX_PARTICIPANTS,
      ownerSecretEnabled: Boolean(process.env.OWNER_SECRET),
      ranks: ASSIGNABLE_RANKS.concat('owner').map((id) => ({
        id,
        label: rankLabel(id),
        level: rankLevel(id),
      })),
    })
  })

  app.post('/api/register', (req, res) => {
    const nickname = cleanNickname(req.body?.nickname)
    const password = cleanPassword(req.body?.password)
    if (!nickname || !password) {
      res.status(400).json({ message: 'ชื่อใช้ตัวอักษร 2–24 ตัว และรหัสผ่านอย่างน้อย 8 ตัว' })
      return
    }
    const result = registerAccount(nickname, password)
    if ('error' in result) {
      res.status(409).json({ message: result.error })
      return
    }
    res.status(201).json(result)
  })

  app.post('/api/login', (req, res) => {
    const nickname = cleanNickname(req.body?.nickname)
    const password = cleanPassword(req.body?.password)
    if (!nickname || !password) {
      res.status(400).json({ message: 'ชื่อหรือรหัสผ่านไม่ถูกต้อง' })
      return
    }
    const result = loginAccount(nickname, password, hashIp(clientAddress(req.socket.remoteAddress)))
    if ('error' in result && result.error) {
      const status = result.error.includes('บ่อย') ? 429 : 401
      res.status(status).json({ message: result.error })
      return
    }
    res.json(result)
  })

  app.post('/api/logout', (req, res) => {
    const token = bearer(req)
    if (token) logoutToken(token)
    res.json({ ok: true })
  })

  app.get('/api/avatars/:accountId', (req, res) => {
    const accountId = req.params.accountId
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(accountId)) {
      res.status(404).end()
      return
    }
    const file = avatarFile(accountId)
    if (!existsSync(file)) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    createReadStream(file).pipe(res)
  })

  app.post(
    '/api/account/avatar',
    express.raw({ type: 'image/webp', limit: '400kb' }),
    (req, res) => {
      const account = accountFromToken(bearer(req))
      if (!account) {
        res.status(401).json({ message: 'เข้าสู่ระบบก่อนอัปโหลดรูป' })
        return
      }
      const body = req.body
      if (!Buffer.isBuffer(body) || !isWebp(body)) {
        res.status(400).json({ message: 'ส่งรูปเป็น webp สี่เหลี่ยม ไม่เกิน 400 KB' })
        return
      }
      writeFileSync(avatarFile(account.id), body)
      avatarVersions.set(account.id, Date.now())
      res.json({ avatarUrl: avatarUrlFor(account.id) })
    },
  )

  app.get('/api/me', (req, res) => {
    const account = accountFromToken(bearer(req))
    if (!account) {
      res.status(401).json({ message: 'ยังไม่ได้เข้าสู่ระบบ' })
      return
    }
    res.json({ account })
  })

  app.post('/api/rooms', (req, res) => {
    const account = accountFromToken(bearer(req))
    if (!account) {
      res.status(401).json({ message: 'เข้าสู่ระบบก่อนสร้างห้อง จึงจะเป็นเจ้าของห้อง' })
      return
    }
    const requested = cleanRoomId(req.body?.roomId)
    const roomId = requested ?? randomRoomCode()
    const existing = getRoom(roomId)
    if (existing) {
      res.status(409).json({ message: 'รหัสห้องนี้มีอยู่แล้ว' })
      return
    }
    insertRoom(roomId, account.id)
    grantSiteOwnerRoom(roomId)
    res.status(201).json({ roomId })
  })

  app.get('/api/dj/tracks/:id/audio', (req, res) => {
    const track = getDjTrack(req.params.id)
    if (!track) {
      res.status(404).end()
      return
    }
    const filePath = path.join(uploadDir, track.filename)
    if (!filePath.startsWith(uploadDir) || !existsSync(filePath)) {
      res.status(404).end()
      return
    }
    res.setHeader('Content-Type', track.mime)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    createReadStream(filePath).pipe(res)
  })

  app.post('/api/rooms/:roomId/dj/tracks', (req, res) => {
    const roomId = cleanRoomId(req.params.roomId)
    const account = accountFromToken(bearer(req))
    if (!roomId || !account) {
      res.status(401).json({ message: 'เข้าสู่ระบบก่อนอัปโหลดเพลง' })
      return
    }
    ensureRoomRecord(roomId, null)
    const room = getRoom(roomId)
    const member = getMember(roomId, account.id)
    const rank = room?.owner_account_id === account.id ? 'owner' : member && isRankId(member.rank) ? member.rank : 'guest'
    if (!room || !permissionsFor(rank).dj) {
      res.status(403).json({ message: 'ยศนี้ยังเปิดเพลงให้ห้องไม่ได้' })
      return
    }
    if (countDjTracks(roomId) >= MAX_TRACKS) {
      res.status(400).json({ message: 'เพลย์ลิสต์เต็มแล้ว (สูงสุด 20 เพลง)' })
      return
    }
    receiveUpload(req, res, roomId, () => emitDj(io, roomId))
  })

  io.on('connection', (socket) => {
    socket.on('join', (payload) => {
      const roomId = cleanRoomId(payload?.roomId)
      const account = accountFromToken(payload?.token)
      const guestName = cleanName(payload?.displayName)
      const name = account?.nickname ?? guestName
      if (!roomId || !name) {
        socket.emit('room-error', { message: 'ชื่อหรือรหัสห้องไม่ถูกต้อง' })
        return
      }
      if (!account && findAccountByKey(nicknameKey(name))) {
        socket.emit('room-error', { message: 'ชื่อนี้เป็นบัญชีสมาชิก ให้เข้าสู่ระบบก่อน' })
        return
      }

      const ipHash = hashIp(clientAddress(socket.handshake.address))
      const guestKey = account ? null : `${ipHash}:${nicknameKey(name)}`
      ensureRoomRecord(roomId, null)
      if (account && isAccountBanned(roomId, account.id)) {
        socket.emit('room-error', { message: 'คุณถูกแบนจากห้องนี้' })
        return
      }
      if (guestKey && isGuestBanned(roomId, guestKey)) {
        socket.emit('room-error', { message: 'คุณถูกแบนจากห้องนี้' })
        return
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) removeFromRoom(io, socket)
      const live = openLive(roomId)
      if (!live) {
        socket.emit('room-error', { message: 'ยังเปิดห้องนี้ไม่ได้' })
        return
      }

      if (account) {
        for (const person of live.participants.values()) {
          if (person.accountId === account.id && person.socketId !== socket.id) {
            socket.emit('room-error', { message: 'บัญชีนี้กำลังอยู่ในห้องจากอีกหน้าจอ' })
            return
          }
        }
      }

      const already = live.participants.get(socket.id)
      if (!already && live.participants.size >= MAX_PARTICIPANTS) {
        socket.emit('room-error', { message: `ห้องนี้เต็มแล้ว รองรับได้สูงสุด ${MAX_PARTICIPANTS} คน` })
        return
      }

      const roomRow = getRoom(roomId)
      let rank: RankId = 'guest'
      let nameColor: string | null = null
      let textMuted = false
      let micMuted = false
      let micBlocked = false
      let camBlocked = false
      let screenBlocked = false
      if (account && roomRow) {
        let member = getMember(roomId, account.id)
        if (!member) {
          rank = isSiteOwnerAccount(account.id) || roomRow.owner_account_id === account.id ? 'owner' : 'member'
          member = {
            room_id: roomId,
            account_id: account.id,
            rank,
            name_color: null,
            text_muted: 0,
            mic_muted: 0,
            mic_blocked: 0,
            cam_blocked: 0,
            screen_blocked: 0,
          }
          upsertMember(member)
        }
        rank =
          isSiteOwnerAccount(account.id) || roomRow.owner_account_id === account.id
            ? 'owner'
            : isRankId(member.rank)
              ? member.rank
              : 'member'
        if (isSiteOwnerAccount(account.id) && member.rank !== 'owner') {
          updateMemberRank(roomId, account.id, 'owner')
          member.rank = 'owner'
        }
        nameColor = member.name_color
        textMuted = member.text_muted === 1
        micMuted = member.mic_muted === 1
        micBlocked = member.mic_blocked === 1
        camBlocked = member.cam_blocked === 1
        screenBlocked = member.screen_blocked === 1
      }

      const user: LiveUser = {
        socketId: socket.id,
        accountId: account?.id ?? null,
        name,
        rank,
        nameColor,
        textMuted,
        micMuted,
        micBlocked,
        camBlocked,
        screenBlocked,
        guestKey,
        audio: Boolean(payload?.audio),
        video: false,
        sharing: false,
        handRaised: false,
        speaker: false,
        speaking: false,
        raisedAt: 0,
      }
      enforceMedia(live, user)
      const hostSeat =
        (user.rank === 'owner' || isSiteOwnerAccount(user.accountId)) &&
        canUseMic(live, user) &&
        speakerCount(live) < MAX_SPEAKERS
      if (hostSeat) user.speaker = true
      live.participants.set(socket.id, user)
      socket.data.roomId = roomId
      socket.data.name = name
      socket.data.accountId = account?.id ?? null
      socket.join(roomId)

      const participant = toPublic(live, user)
      if (!already) {
        const notice = makeMessage('system', `${name} เข้าร่วมห้อง`, name, {
          rank: user.rank,
          rankLabel: rankLabel(user.rank),
          color: participant.color,
        })
        pushMessage(io, roomId, live, notice)
        socket.to(roomId).emit('participant-joined', participant)
        console.log(`[room] join ${roomId} size=${live.participants.size} rank=${user.rank}`)
      }
      socket.emit('room-state', roomStatePayload(socket, roomId, live, user))
    })

    socket.on('chat', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      if (context.user.textMuted) {
        socket.emit('mod-error', { message: 'คุณถูกปิดแชต' })
        return
      }
      const text = cleanText(payload?.text)
      if (!text) return
      const now = Date.now()
      const previous = lastChatAt.get(socket.id) ?? 0
      if (now - previous < 120) return
      lastChatAt.set(socket.id, now)
      const view = toPublic(context.live, context.user)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('chat', text, context.user.name, {
          from: socket.id,
          rank: context.user.rank,
          rankLabel: rankLabel(context.user.rank),
          color: view.color,
          avatarUrl: view.avatarUrl,
        }),
      )
    })

    socket.on('media-state', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      const mic = Boolean(payload?.audio) && canUseMic(context.live, context.user)
      const cam = Boolean(payload?.video) && canUseCam(context.live, context.user)
      context.user.audio = mic
      context.user.video = cam
      const view = toPublic(context.live, context.user)
      io.to(context.roomId).emit('media-state', { id: socket.id, audio: view.audio, video: view.video })
      if (Boolean(payload?.audio) !== view.audio || Boolean(payload?.video) !== view.video) {
        socket.emit('media-control', {
          micAllowed: view.micAllowed,
          camAllowed: view.camAllowed,
          screenAllowed: view.screenAllowed,
          textMuted: view.textMuted,
        })
      }
    })

    socket.on('screen-state', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      const want = Boolean(payload?.sharing) && canShare(context.live, context.user)
      const was = context.user.sharing
      context.user.sharing = want
      const view = toPublic(context.live, context.user)
      io.to(context.roomId).emit('screen-state', { id: socket.id, sharing: view.sharing })
      io.to(context.roomId).emit('participant-updated', view)
      if (want !== was) {
        pushMessage(
          io,
          context.roomId,
          context.live,
          makeMessage(
            'system',
            want ? `${context.user.name} เริ่มแชร์หน้าจอ` : `${context.user.name} หยุดแชร์หน้าจอ`,
            context.user.name,
          ),
        )
      }
      if (Boolean(payload?.sharing) !== view.sharing) {
        socket.emit('media-control', {
          micAllowed: view.micAllowed,
          camAllowed: view.camAllowed,
          screenAllowed: view.screenAllowed,
          textMuted: view.textMuted,
        })
      }
    })

    socket.on('raise-hand', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      if (context.user.speaker) return
      const raised = Boolean(payload?.raised) && canUseMic(context.live, context.user)
      context.user.handRaised = raised
      context.user.raisedAt = raised ? Date.now() : 0
      broadcastUser(io, context.roomId, context.live, context.user)
      if (raised) {
        pushMessage(
          io,
          context.roomId,
          context.live,
          makeMessage('system', `${context.user.name} ขอพูด`, context.user.name),
        )
      }
    })

    socket.on('take-slot', () => {
      const context = actorContext(socket)
      if (!context) return
      if (context.user.speaker) return
      if (!canUseMic(context.live, context.user) || rankLevel(context.user.rank) < rankLevel('moderator')) {
        socket.emit('mod-error', { message: 'ยศนี้ยังขึ้นพูดเองไม่ได้ ขอพูดแล้วรอผู้ดูแล' })
        return
      }
      if (speakerCount(context.live) >= MAX_SPEAKERS) {
        socket.emit('mod-error', { message: 'ไมค์เต็มแล้ว' })
        return
      }
      context.user.speaker = true
      context.user.handRaised = false
      broadcastUser(io, context.roomId, context.live, context.user)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name} ขึ้นพูด`, context.user.name),
      )
    })

    socket.on('grant-speaker', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).mute) return
      const target = context.live.participants.get(payload?.socketId ?? '')
      if (!target || !canCommand(context.user, target)) {
        socket.emit('mod-error', { message: 'ให้คนนี้พูดไม่ได้' })
        return
      }
      if (!canUseMic(context.live, target)) {
        socket.emit('mod-error', { message: 'คนนี้ถูกจำกัดไมค์' })
        return
      }
      if (!target.speaker && speakerCount(context.live) >= MAX_SPEAKERS) {
        socket.emit('mod-error', { message: 'ไมค์เต็มแล้ว' })
        return
      }
      target.speaker = true
      target.handRaised = false
      broadcastUser(io, context.roomId, context.live, target)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name} ให้${target.name}พูด`, context.user.name),
      )
    })

    socket.on('revoke-speaker', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).mute) return
      const target = context.live.participants.get(payload?.socketId ?? '')
      if (!target || !canCommand(context.user, target)) return
      target.speaker = false
      target.audio = false
      target.speaking = false
      broadcastUser(io, context.roomId, context.live, target)
      io.to(context.roomId).emit('mic-end', { id: target.socketId, gen: 0 })
    })

    socket.on('voice', (payload) => {
      const context = actorContext(socket)
      if (!context?.user.speaker) return
      const speaking = Boolean(payload?.speaking) && context.user.audio
      if (context.user.speaking === speaking) return
      context.user.speaking = speaking
      io.to(context.roomId).emit('participant-updated', toPublic(context.live, context.user))
    })

    socket.on('mic-chunk', (payload) => {
      const context = actorContext(socket)
      const chunk = chunkBuffer(payload?.chunk)
      if (!context?.user.speaker || !context.user.audio || !chunk) return
      socket.volatile.to(context.roomId).emit('mic-chunk', {
        id: socket.id,
        gen: Number(payload?.gen) || 0,
        seq: Number(payload?.seq) || 0,
        mime: typeof payload?.mime === 'string' ? payload.mime.slice(0, 80) : 'audio/webm;codecs=opus',
        chunk,
      })
    })

    socket.on('mic-end', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      socket.to(context.roomId).emit('mic-end', { id: socket.id, gen: Number(payload?.gen) || 0 })
    })

    socket.on('screen-chunk', (payload) => {
      const context = actorContext(socket)
      const chunk = chunkBuffer(payload?.chunk)
      if (!context?.user.sharing || !chunk) return
      socket.volatile.to(context.roomId).emit('screen-chunk', {
        id: socket.id,
        gen: Number(payload?.gen) || 0,
        seq: Number(payload?.seq) || 0,
        mime: typeof payload?.mime === 'string' ? payload.mime.slice(0, 80) : 'video/webm;codecs=vp8',
        chunk,
      })
    })

    socket.on('screen-end', (payload) => {
      const context = actorContext(socket)
      if (!context) return
      socket.to(context.roomId).emit('screen-end', { id: socket.id, gen: Number(payload?.gen) || 0 })
    })

    socket.on('avatar-refresh', () => {
      const context = actorContext(socket)
      if (!context?.user.accountId) return
      avatarVersions.delete(context.user.accountId)
      broadcastUser(io, context.roomId, context.live, context.user)
    })

    socket.on('clear-avatar', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).mute) return
      const target = [...context.live.participants.values()].find((person) => person.accountId === payload?.accountId)
      if (!target?.accountId || !canCommand(context.user, target)) {
        socket.emit('mod-error', { message: 'ลบรูปคนนี้ไม่ได้' })
        return
      }
      const file = avatarFile(target.accountId)
      if (existsSync(file)) unlinkSync(file)
      avatarVersions.set(target.accountId, 0)
      broadcastUser(io, context.roomId, context.live, target)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name} ลบรูปของ${target.name}`, context.user.name),
      )
    })

    socket.on('signal', (payload) => {
      const context = actorContext(socket)
      const to = payload?.to
      if (!context || typeof to !== 'string' || to === socket.id || !context.live.participants.has(to)) return
      if (!isSignal(payload.data)) return
      io.to(to).emit('signal', { from: socket.id, data: payload.data })
    })

    socket.on('mod-rank', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).manageRanks) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์ตั้งยศ' })
        return
      }
      const rank = payload?.rank
      if (!isRankId(rank) || !ASSIGNABLE_RANKS.includes(rank)) {
        socket.emit('mod-error', { message: 'ยศนี้ตั้งให้ไม่ได้' })
        return
      }
      const target = [...context.live.participants.values()].find((person) => person.accountId === payload?.accountId)
      if (!target?.accountId) {
        socket.emit('mod-error', { message: 'ตั้งยศได้เฉพาะคนที่มีบัญชี' })
        return
      }
      if (!canCommand(context.user, target) || rankLevel(rank) > rankLevel(context.user.rank)) {
        socket.emit('mod-error', { message: 'ตั้งยศให้คนที่ยศสูงกว่าหรือเท่ากันไม่ได้' })
        return
      }
      updateMemberRank(context.roomId, target.accountId, rank)
      syncAccountUser(context.roomId, target)
      broadcastUser(io, context.roomId, context.live, target)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name} ตั้งยศ${rankLabel(rank)}ให้${target.name}`, context.user.name),
      )
    })

    socket.on('mod-color', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).manageColors) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์ตั้งสีชื่อ' })
        return
      }
      const target = [...context.live.participants.values()].find((person) => person.accountId === payload?.accountId)
      const samePerson = target?.socketId === socket.id
      if (!target?.accountId || (!samePerson && !canCommand(context.user, target))) {
        socket.emit('mod-error', { message: 'ตั้งสีชื่อให้คนนี้ไม่ได้' })
        return
      }
      const color = payload?.color == null || payload.color === '' ? null : cleanHexColor(payload.color)
      if (payload?.color && !color) {
        socket.emit('mod-error', { message: 'สีต้องเป็นรหัส #RRGGBB' })
        return
      }
      updateMemberColor(context.roomId, target.accountId, color)
      syncAccountUser(context.roomId, target)
      broadcastUser(io, context.roomId, context.live, target)
    })

    socket.on('mod-rank-color', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).manageColors) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์ตั้งสียศ' })
        return
      }
      if (!isRankId(payload?.rank)) return
      const color = cleanHexColor(payload?.color)
      if (!color) {
        socket.emit('mod-error', { message: 'สีต้องเป็นรหัส #RRGGBB' })
        return
      }
      if (payload.rank === 'owner' && context.user.rank !== 'owner') {
        socket.emit('mod-error', { message: 'เฉพาะเจ้าของห้องที่เปลี่ยนสีของยศเจ้าของได้' })
        return
      }
      setRankColor(context.roomId, payload.rank, color)
      reloadRoomPolicy(context.roomId)
      io.to(context.roomId).emit('rank-colors', context.live.rankColors)
      for (const person of context.live.participants.values()) broadcastUser(io, context.roomId, context.live, person)
    })

    socket.on('mod-flag', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).mute) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์สั่งนี้' })
        return
      }
      const flag = payload?.flag
      if (
        flag !== 'textMuted' &&
        flag !== 'micMuted' &&
        flag !== 'micBlocked' &&
        flag !== 'camBlocked' &&
        flag !== 'screenBlocked'
      ) {
        return
      }
      const target = [...context.live.participants.values()].find((person) => person.accountId === payload?.accountId)
      if (!target || !canCommand(context.user, target)) {
        socket.emit('mod-error', { message: 'สั่งคนนี้ไม่ได้' })
        return
      }
      const value = Boolean(payload?.value)
      if (flag === 'textMuted') target.textMuted = value
      if (flag === 'micMuted') {
        target.micMuted = value
        if (value) target.audio = false
      }
      if (flag === 'micBlocked') {
        target.micBlocked = value
        if (value) {
          target.audio = false
          target.speaker = false
          target.speaking = false
          target.handRaised = false
        }
      }
      if (flag === 'camBlocked') {
        target.camBlocked = value
        if (value) target.video = false
      }
      if (flag === 'screenBlocked') {
        target.screenBlocked = value
        if (value) target.sharing = false
      }
      if (target.accountId) {
        updateMemberFlags(context.roomId, target.accountId, {
          text_muted: target.textMuted ? 1 : 0,
          mic_muted: target.micMuted ? 1 : 0,
          mic_blocked: target.micBlocked ? 1 : 0,
          cam_blocked: target.camBlocked ? 1 : 0,
          screen_blocked: target.screenBlocked ? 1 : 0,
        })
      }
      broadcastUser(io, context.roomId, context.live, target)
      const flagLabels: Record<string, [string, string]> = {
        textMuted: ['ปิดแชต', 'เปิดแชต'],
        micMuted: ['ปิดไมค์', 'เปิดไมค์'],
        micBlocked: ['ห้ามเปิดไมค์', 'อนุญาตไมค์'],
        camBlocked: ['ห้ามเปิดกล้อง', 'อนุญาตกล้อง'],
        screenBlocked: ['ห้ามแชร์จอ', 'อนุญาตแชร์จอ'],
      }
      const pair = flagLabels[flag] ?? ['อัปเดต', 'อัปเดต']
      const label = value ? pair[0] : pair[1]
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name}${label}ของ${target.name}`, context.user.name),
      )
    })

    socket.on('mod-kick', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).kick) return
      const targetId = payload?.socketId
      if (!targetId || targetId === socket.id) return
      const target = context.live.participants.get(targetId)
      if (!target || !canCommand(context.user, target)) {
        socket.emit('mod-error', { message: 'เตะคนนี้ไม่ได้' })
        return
      }
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${target.name} ถูกเตะออกจากห้อง`, context.user.name),
      )
      const targetSocket = io.sockets.sockets.get(targetId) as AppSocket | undefined
      if (targetSocket) {
        targetSocket.data.suppressLeave = true
        targetSocket.emit('kicked', { message: 'คุณถูกเตะออกจากห้อง' })
        targetSocket.disconnect(true)
      }
    })

    socket.on('mod-ban', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).ban) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์แบน' })
        return
      }
      const targetId = payload?.socketId
      if (!targetId || targetId === socket.id) return
      const target = context.live.participants.get(targetId)
      if (!target || !canCommand(context.user, target)) {
        socket.emit('mod-error', { message: 'แบนคนนี้ไม่ได้' })
        return
      }
      addBan(randomBytes(9).toString('base64url'), context.roomId, target.accountId, target.guestKey)
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${target.name} ถูกแบนจากห้อง`, context.user.name),
      )
      const targetSocket = io.sockets.sockets.get(targetId) as AppSocket | undefined
      if (targetSocket) {
        targetSocket.data.suppressLeave = true
        targetSocket.emit('kicked', { message: 'คุณถูกแบนจากห้องนี้' })
        targetSocket.disconnect(true)
      }
    })

    socket.on('mod-policy', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).mediaPolicy) {
        socket.emit('mod-error', { message: 'คุณไม่มีสิทธิ์ตั้งกฎอุปกรณ์' })
        return
      }
      if (!isRankId(payload?.micMinRank) || !isRankId(payload?.camMinRank) || !isRankId(payload?.screenMinRank)) return
      setRoomPolicy(context.roomId, payload.micMinRank, payload.camMinRank, payload.screenMinRank)
      reloadRoomPolicy(context.roomId)
      io.to(context.roomId).emit('policy', context.live.policy)
      for (const person of context.live.participants.values()) {
        enforceMedia(context.live, person)
        broadcastUser(io, context.roomId, context.live, person)
      }
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage(
          'system',
          `ปรับสิทธิ์อุปกรณ์: ไมค์ตั้งแต่ยศ${rankLabel(payload.micMinRank)} กล้องตั้งแต่ยศ${rankLabel(payload.camMinRank)} แชร์จอตั้งแต่ยศ${rankLabel(payload.screenMinRank)}`,
          context.user.name,
        ),
      )
    })

    socket.on('claim-owner', (payload) => {
      const context = actorContext(socket)
      if (!context?.user.accountId) {
        socket.emit('mod-error', { message: 'เข้าสู่ระบบก่อนยืนยันรหัสเจ้าของ' })
        return
      }
      if (!secretMatches(typeof payload?.secret === 'string' ? payload.secret : '')) {
        socket.emit('mod-error', { message: 'รหัสเจ้าของไม่ถูกต้อง' })
        return
      }
      const room = getRoom(context.roomId)
      if (!room) return
      if (room.owner_account_id && room.owner_account_id !== context.user.accountId) {
        const previous = getMember(context.roomId, room.owner_account_id)
        if (previous && !isSiteOwnerAccount(room.owner_account_id)) updateMemberRank(context.roomId, room.owner_account_id, 'admin')
        const previousLive = findLiveByAccount(context.live, room.owner_account_id)
        if (previousLive) syncAccountUser(context.roomId, previousLive)
      }
      setRoomOwner(context.roomId, context.user.accountId)
      const member = getMember(context.roomId, context.user.accountId)
      if (member) updateMemberRank(context.roomId, context.user.accountId, 'owner')
      else {
        upsertMember({
          room_id: context.roomId,
          account_id: context.user.accountId,
          rank: 'owner',
          name_color: null,
          text_muted: 0,
          mic_muted: 0,
          mic_blocked: 0,
          cam_blocked: 0,
          screen_blocked: 0,
        })
      }
      for (const person of context.live.participants.values()) {
        if (person.accountId) syncAccountUser(context.roomId, person)
        broadcastUser(io, context.roomId, context.live, person)
      }
      pushMessage(
        io,
        context.roomId,
        context.live,
        makeMessage('system', `${context.user.name} ยืนยันตัวเป็นเจ้าของห้อง`, context.user.name),
      )
    })

    socket.on('dj-play', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).dj) {
        socket.emit('mod-error', { message: 'ยศนี้ยังเปิดเพลงให้ห้องไม่ได้' })
        return
      }
      const tracks = listDjTracks(context.roomId)
      const requested = payload?.trackId ? getDjTrack(payload.trackId) : undefined
      const current = getPlayback(context.roomId)
      const track = requested && requested.room_id === context.roomId ? requested : tracks.find((item) => item.id === current?.track_id) ?? tracks[0]
      if (!track) {
        socket.emit('mod-error', { message: 'ยังไม่มีเพลงในเพลย์ลิสต์' })
        return
      }
      const same = current?.track_id === track.id
      const offset = same && current ? playedOffset(current) : 0
      savePlayback({
        room_id: context.roomId,
        track_id: track.id,
        playing: 1,
        offset_ms: offset,
        started_at: Date.now(),
      })
      emitDj(io, context.roomId)
    })

    socket.on('dj-pause', () => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).dj) return
      const current = getPlayback(context.roomId)
      if (!current?.track_id) return
      savePlayback({
        room_id: context.roomId,
        track_id: current.track_id,
        playing: 0,
        offset_ms: playedOffset(current),
        started_at: null,
      })
      emitDj(io, context.roomId)
    })

    socket.on('dj-skip', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).dj) return
      const tracks = listDjTracks(context.roomId)
      if (tracks.length === 0) return
      const current = getPlayback(context.roomId)
      const index = Math.max(0, tracks.findIndex((track) => track.id === current?.track_id))
      const direction = payload?.direction === -1 ? -1 : 1
      const next = tracks[(index + direction + tracks.length) % tracks.length]
      if (!next) return
      savePlayback({
        room_id: context.roomId,
        track_id: next.id,
        playing: 1,
        offset_ms: 0,
        started_at: Date.now(),
      })
      emitDj(io, context.roomId)
    })

    socket.on('dj-remove', (payload) => {
      const context = actorContext(socket)
      if (!context || !permissionsFor(context.user.rank).dj) return
      const track = payload?.trackId ? getDjTrack(payload.trackId) : undefined
      if (!track || track.room_id !== context.roomId) return
      deleteDjTrack(track.id)
      const filePath = path.join(uploadDir, track.filename)
      if (filePath.startsWith(uploadDir) && existsSync(filePath)) unlinkSync(filePath)
      const current = getPlayback(context.roomId)
      if (current?.track_id === track.id) {
        const rest = listDjTracks(context.roomId)
        const next = rest[0]
        savePlayback({
          room_id: context.roomId,
          track_id: next?.id ?? null,
          playing: next ? 1 : 0,
          offset_ms: 0,
          started_at: next ? Date.now() : null,
        })
      }
      emitDj(io, context.roomId)
    })

    socket.on('disconnect', () => {
      lastChatAt.delete(socket.id)
      removeFromRoom(io, socket)
    })
  })

  if (isProd) {
    const clientDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'client')
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
          else res.setHeader('Cache-Control', 'public, max-age=3600')
        },
      }),
    )
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io')) return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(clientDir, 'index.html'), (error) => {
        if (error) next(error)
      })
    })
  } else {
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, ws: { server: httpServer } },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    const turn = process.env.TURN_URLS || process.env.TURN_URL
    console.log(`คุยวง ready at http://127.0.0.1:${PORT}`)
    console.log(turn ? 'TURN configured' : 'TURN not set — using public STUN only')
    console.log(process.env.OWNER_SECRET ? 'OWNER_SECRET configured' : 'OWNER_SECRET not set')
  })
}

function chunkBuffer(chunk: unknown) {
  if (Buffer.isBuffer(chunk)) return chunk.length > 0 && chunk.length <= 512_000 ? chunk : null
  if (chunk instanceof Uint8Array) {
    const view = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    return view.length > 0 && view.length <= 512_000 ? view : null
  }
  return null
}

function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

function receiveUpload(req: Request, res: Response, roomId: string, onSaved: () => void) {
  const parser = busboy({
    headers: req.headers,
    limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
  })
  let storedName = ''
  let title = 'เพลงไม่มีชื่อ'
  let mime = 'application/octet-stream'
  let failed = ''
  let bytes = 0
  let writeDone = Promise.resolve()
  const id = randomBytes(16).toString('hex')

  parser.on('file', (_name, file, info) => {
    const filename = decodeUploadName(info.filename || 'audio')
    const ext = audioExtension(filename, info.mimeType || '')
    if (!ext) {
      failed = 'รองรับไฟล์ mp3, wav, ogg, m4a หรือ webm'
      file.resume()
      return
    }
    title = cleanTitle(filename)
    mime = info.mimeType || 'application/octet-stream'
    storedName = `${id}${ext}`
    const dest = path.join(uploadDir, storedName)
    const writer = createWriteStream(dest)
    writeDone = new Promise((resolve, reject) => {
      writer.on('finish', () => resolve())
      writer.on('error', () => reject(new Error('write failed')))
    })
    file.on('data', (chunk: Buffer) => {
      bytes += chunk.length
    })
    file.on('limit', () => {
      failed = 'ไฟล์ใหญ่เกิน 12 MB'
    })
    file.pipe(writer)
  })

  parser.on('error', () => {
    failed = 'อัปโหลดไม่สำเร็จ'
  })

  parser.on('close', () => {
    void writeDone
      .then(() => {
        if (!storedName || failed || bytes < 44) {
          if (storedName) {
            const dest = path.join(uploadDir, storedName)
            if (existsSync(dest)) unlinkSync(dest)
          }
          res.status(400).json({ message: failed || 'ไม่พบไฟล์เสียง' })
          return
        }
        const header = readFileSync(path.join(uploadDir, storedName)).subarray(0, 16)
        if (!looksLikeAudio(header, storedName)) {
          unlinkSync(path.join(uploadDir, storedName))
          res.status(400).json({ message: 'ไฟล์นี้ไม่ใช่เสียงที่รองรับ' })
          return
        }
        insertDjTrack({
          id,
          room_id: roomId,
          title,
          filename: storedName,
          mime,
          position: nextDjPosition(roomId),
          created_at: Date.now(),
        })
        onSaved()
        res.status(201).json({ id, title })
      })
      .catch(() => {
        res.status(500).json({ message: 'บันทึกไฟล์ไม่สำเร็จ' })
      })
  })

  req.pipe(parser)
}

function looksLikeAudio(header: Buffer, filename: string) {
  const text = header.toString('ascii')
  if (filename.endsWith('.wav')) return text.startsWith('RIFF')
  if (filename.endsWith('.ogg')) return text.startsWith('OggS')
  if (filename.endsWith('.mp3')) return text.startsWith('ID3') || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
  if (filename.endsWith('.webm')) return header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
  if (filename.endsWith('.m4a')) return text.includes('ftyp')
  return false
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
