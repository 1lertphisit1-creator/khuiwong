export type RankId = 'owner' | 'admin' | 'moderator' | 'vip' | 'member' | 'guest'

export type Permissions = {
  manageRanks: boolean
  manageColors: boolean
  kick: boolean
  ban: boolean
  mute: boolean
  mediaPolicy: boolean
  dj: boolean
}

export type Participant = {
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

export type ChatMessage = {
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

export type DjTrack = { id: string; title: string; url?: string }

export type DjState = {
  track: { id: string; title: string; url: string } | null
  playing: boolean
  offsetMs: number
  startedAt: number | null
  serverNow: number
  playlist: { id: string; title: string }[]
}

export type RoomPolicy = {
  micMinRank: RankId
  camMinRank: RankId
  screenMinRank: RankId
}

export type SelfProfile = {
  accountId: string | null
  rank: RankId
  rankLabel: string
  permissions: Permissions
  textMuted: boolean
  micAllowed: boolean
  camAllowed: boolean
  screenAllowed: boolean
}

export type RoomState = {
  selfId: string
  roomId: string
  participants: Participant[]
  messages: ChatMessage[]
  self: SelfProfile
  policy: RoomPolicy
  rankColors: Record<RankId, string>
  dj: DjState
  ownerSecretEnabled: boolean
  caps?: { people: number; speakers: number }
}

export type SignalData = {
  description?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export const RANK_OPTIONS: { id: RankId; label: string }[] = [
  { id: 'owner', label: 'เจ้าของ' },
  { id: 'admin', label: 'ผู้ดูแล' },
  { id: 'moderator', label: 'ผู้ช่วย' },
  { id: 'vip', label: 'วีไอพี' },
  { id: 'member', label: 'สมาชิก' },
  { id: 'guest', label: 'ผู้มาเยือน' },
]

export function safeColor(color: string | undefined, fallback = '#f6f1e7') {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color
  return fallback
}
