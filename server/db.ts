import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  defaultRankColor,
  isRankId,
  RANK_IDS,
  type RankId,
} from './ranks.ts'

export type AccountRow = {
  id: string
  nickname: string
  nickname_key: string
  password_hash: string
  created_at: number
}

export type RoomRow = {
  id: string
  owner_account_id: string | null
  mic_min_rank: string
  cam_min_rank: string
  screen_min_rank: string
  created_at: number
}

export type MemberRow = {
  room_id: string
  account_id: string
  rank: string
  name_color: string | null
  text_muted: number
  mic_muted: number
  mic_blocked: number
  cam_blocked: number
  screen_blocked: number
}

export type DjTrackRow = {
  id: string
  room_id: string
  title: string
  filename: string
  mime: string
  position: number
  created_at: number
}

export type DjPlaybackRow = {
  room_id: string
  track_id: string | null
  playing: number
  offset_ms: number
  started_at: number | null
}

export function dataDir() {
  const configured = process.env.DATA_DIR?.trim()
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), 'data')
}

const resolvedDataDir = dataDir()
mkdirSync(resolvedDataDir, { recursive: true })

const db = new DatabaseSync(path.join(resolvedDataDir, 'khuiwong.sqlite'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    nickname_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    owner_account_id TEXT,
    mic_min_rank TEXT NOT NULL DEFAULT 'guest',
    cam_min_rank TEXT NOT NULL DEFAULT 'guest',
    screen_min_rank TEXT NOT NULL DEFAULT 'member',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    rank TEXT NOT NULL,
    name_color TEXT,
    text_muted INTEGER NOT NULL DEFAULT 0,
    mic_muted INTEGER NOT NULL DEFAULT 0,
    mic_blocked INTEGER NOT NULL DEFAULT 0,
    cam_blocked INTEGER NOT NULL DEFAULT 0,
    screen_blocked INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (room_id, account_id)
  );
  CREATE TABLE IF NOT EXISTS rank_colors (
    room_id TEXT NOT NULL,
    rank TEXT NOT NULL,
    color TEXT NOT NULL,
    PRIMARY KEY (room_id, rank)
  );
  CREATE TABLE IF NOT EXISTS bans (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    account_id TEXT,
    guest_key TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dj_tracks (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS dj_playback (
    room_id TEXT PRIMARY KEY,
    track_id TEXT,
    playing INTEGER NOT NULL DEFAULT 0,
    offset_ms INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER
  );
`)

function columnNames(table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name)
}

function addColumn(table: string, column: string, definition: string) {
  if (columnNames(table).includes(column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

addColumn('rooms', 'screen_min_rank', "TEXT NOT NULL DEFAULT 'member'")
addColumn('room_members', 'screen_blocked', 'INTEGER NOT NULL DEFAULT 0')

export function insertAccount(row: AccountRow) {
  db.prepare(
    'INSERT INTO accounts (id, nickname, nickname_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(row.id, row.nickname, row.nickname_key, row.password_hash, row.created_at)
}

export function findAccountByKey(nicknameKey: string) {
  return db.prepare('SELECT * FROM accounts WHERE nickname_key = ?').get(nicknameKey) as AccountRow | undefined
}

export function findAccountById(id: string) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined
}

export function insertSession(tokenHash: string, accountId: string, expiresAt: number) {
  db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    accountId,
    expiresAt,
  )
}

export function deleteSession(tokenHash: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash)
}

export function findSession(tokenHash: string) {
  return db.prepare('SELECT account_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as
    | { account_id: string; expires_at: number }
    | undefined
}

export function getRoom(roomId: string) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined
}

export function insertRoom(roomId: string, ownerAccountId: string | null) {
  const now = Date.now()
  db.prepare(
    'INSERT INTO rooms (id, owner_account_id, mic_min_rank, cam_min_rank, screen_min_rank, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(roomId, ownerAccountId, 'guest', 'guest', 'member', now)
  const seed = db.prepare('INSERT INTO rank_colors (room_id, rank, color) VALUES (?, ?, ?)')
  for (const rank of RANK_IDS) seed.run(roomId, rank, defaultRankColor(rank))
  db.prepare(
    'INSERT INTO dj_playback (room_id, track_id, playing, offset_ms, started_at) VALUES (?, NULL, 0, 0, NULL)',
  ).run(roomId)
  if (ownerAccountId) {
    upsertMember({
      room_id: roomId,
      account_id: ownerAccountId,
      rank: 'owner',
      name_color: null,
      text_muted: 0,
      mic_muted: 0,
      mic_blocked: 0,
      cam_blocked: 0,
      screen_blocked: 0,
    })
  }
}

export function setRoomOwner(roomId: string, accountId: string) {
  db.prepare('UPDATE rooms SET owner_account_id = ? WHERE id = ?').run(accountId, roomId)
}

export function setRoomPolicy(roomId: string, micMinRank: RankId, camMinRank: RankId, screenMinRank: RankId) {
  db.prepare('UPDATE rooms SET mic_min_rank = ?, cam_min_rank = ?, screen_min_rank = ? WHERE id = ?').run(
    micMinRank,
    camMinRank,
    screenMinRank,
    roomId,
  )
}

export function getMember(roomId: string, accountId: string) {
  return db.prepare('SELECT * FROM room_members WHERE room_id = ? AND account_id = ?').get(roomId, accountId) as
    | MemberRow
    | undefined
}

export function upsertMember(row: MemberRow) {
  db.prepare(
    `INSERT INTO room_members (room_id, account_id, rank, name_color, text_muted, mic_muted, mic_blocked, cam_blocked, screen_blocked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(room_id, account_id) DO UPDATE SET
       rank = excluded.rank,
       name_color = excluded.name_color,
       text_muted = excluded.text_muted,
       mic_muted = excluded.mic_muted,
       mic_blocked = excluded.mic_blocked,
       cam_blocked = excluded.cam_blocked,
       screen_blocked = excluded.screen_blocked`,
  ).run(
    row.room_id,
    row.account_id,
    row.rank,
    row.name_color,
    row.text_muted,
    row.mic_muted,
    row.mic_blocked,
    row.cam_blocked,
    row.screen_blocked,
  )
}

export function updateMemberRank(roomId: string, accountId: string, rank: RankId) {
  db.prepare('UPDATE room_members SET rank = ? WHERE room_id = ? AND account_id = ?').run(rank, roomId, accountId)
}

export function updateMemberColor(roomId: string, accountId: string, color: string | null) {
  db.prepare('UPDATE room_members SET name_color = ? WHERE room_id = ? AND account_id = ?').run(color, roomId, accountId)
}

export function updateMemberFlags(
  roomId: string,
  accountId: string,
  flags: Partial<Pick<MemberRow, 'text_muted' | 'mic_muted' | 'mic_blocked' | 'cam_blocked' | 'screen_blocked'>>,
) {
  const current = getMember(roomId, accountId)
  if (!current) return
  upsertMember({ ...current, ...flags })
}

export function getRankColors(roomId: string) {
  const rows = db.prepare('SELECT rank, color FROM rank_colors WHERE room_id = ?').all(roomId) as {
    rank: string
    color: string
  }[]
  const colors = {} as Record<RankId, string>
  for (const rank of RANK_IDS) colors[rank] = defaultRankColor(rank)
  for (const row of rows) {
    if (isRankId(row.rank)) colors[row.rank] = row.color
  }
  return colors
}

export function setRankColor(roomId: string, rank: RankId, color: string) {
  db.prepare(
    `INSERT INTO rank_colors (room_id, rank, color) VALUES (?, ?, ?)
     ON CONFLICT(room_id, rank) DO UPDATE SET color = excluded.color`,
  ).run(roomId, rank, color)
}

export function isAccountBanned(roomId: string, accountId: string) {
  const row = db.prepare('SELECT id FROM bans WHERE room_id = ? AND account_id = ?').get(roomId, accountId) as
    | { id: string }
    | undefined
  return Boolean(row)
}

export function isGuestBanned(roomId: string, guestKey: string) {
  const row = db.prepare('SELECT id FROM bans WHERE room_id = ? AND guest_key = ?').get(roomId, guestKey) as
    | { id: string }
    | undefined
  return Boolean(row)
}

export function addBan(id: string, roomId: string, accountId: string | null, guestKey: string | null) {
  db.prepare('INSERT INTO bans (id, room_id, account_id, guest_key, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    roomId,
    accountId,
    guestKey,
    Date.now(),
  )
}

export function listDjTracks(roomId: string) {
  return db.prepare('SELECT * FROM dj_tracks WHERE room_id = ? ORDER BY position ASC, created_at ASC').all(roomId) as DjTrackRow[]
}

export function countDjTracks(roomId: string) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM dj_tracks WHERE room_id = ?').get(roomId) as { count: number }
  return row.count
}

export function insertDjTrack(row: DjTrackRow) {
  db.prepare(
    'INSERT INTO dj_tracks (id, room_id, title, filename, mime, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(row.id, row.room_id, row.title, row.filename, row.mime, row.position, row.created_at)
}

export function nextDjPosition(roomId: string) {
  const row = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM dj_tracks WHERE room_id = ?').get(roomId) as {
    max: number
  }
  return row.max + 1
}

export function getDjTrack(id: string) {
  return db.prepare('SELECT * FROM dj_tracks WHERE id = ?').get(id) as DjTrackRow | undefined
}

export function deleteDjTrack(id: string) {
  db.prepare('DELETE FROM dj_tracks WHERE id = ?').run(id)
}

export function getPlayback(roomId: string) {
  return db.prepare('SELECT * FROM dj_playback WHERE room_id = ?').get(roomId) as DjPlaybackRow | undefined
}

export function savePlayback(row: DjPlaybackRow) {
  db.prepare(
    `INSERT INTO dj_playback (room_id, track_id, playing, offset_ms, started_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id) DO UPDATE SET
       track_id = excluded.track_id,
       playing = excluded.playing,
       offset_ms = excluded.offset_ms,
       started_at = excluded.started_at`,
  ).run(row.room_id, row.track_id, row.playing, row.offset_ms, row.started_at)
}
