export const RANK_IDS = ['owner', 'admin', 'moderator', 'vip', 'member', 'guest'] as const

export type RankId = (typeof RANK_IDS)[number]

export type Permissions = {
  manageRanks: boolean
  manageColors: boolean
  kick: boolean
  ban: boolean
  mute: boolean
  mediaPolicy: boolean
  dj: boolean
}

const RANK_META: Record<RankId, { label: string; level: number; color: string }> = {
  owner: { label: 'เจ้าของ', level: 60, color: '#e6a15c' },
  admin: { label: 'ผู้ดูแล', level: 50, color: '#e07a68' },
  moderator: { label: 'ผู้ช่วย', level: 40, color: '#7fbfb2' },
  vip: { label: 'วีไอพี', level: 30, color: '#c9a0dc' },
  member: { label: 'สมาชิก', level: 20, color: '#f6f1e7' },
  guest: { label: 'ผู้มาเยือน', level: 10, color: '#b3a898' },
}

export function isRankId(value: unknown): value is RankId {
  return typeof value === 'string' && (RANK_IDS as readonly string[]).includes(value)
}

export function rankLabel(rank: RankId) {
  return RANK_META[rank].label
}

export function rankLevel(rank: RankId) {
  return RANK_META[rank].level
}

export function defaultRankColor(rank: RankId) {
  return RANK_META[rank].color
}

export function permissionsFor(rank: RankId): Permissions {
  const level = rankLevel(rank)
  return {
    manageRanks: level >= rankLevel('admin'),
    manageColors: level >= rankLevel('admin'),
    kick: level >= rankLevel('moderator'),
    ban: level >= rankLevel('admin'),
    mute: level >= rankLevel('moderator'),
    mediaPolicy: level >= rankLevel('admin'),
    dj: level >= rankLevel('vip'),
  }
}

export function outranks(actor: RankId, target: RankId) {
  return rankLevel(actor) > rankLevel(target)
}

export function cleanHexColor(value: unknown) {
  if (typeof value !== 'string') return null
  const color = value.trim().toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(color)) return null
  return color
}

export const ASSIGNABLE_RANKS: RankId[] = ['admin', 'moderator', 'vip', 'member', 'guest']
