import type { RankId } from '@/types.ts'
import { api } from '@/lib/session.ts'

export type ForumAuthor = {
  accountId: string | null
  name: string
  rank: RankId
  rankLabel: string
  color: string
  avatarUrl: string | null
  posts: number
  signature: string
}

export type ForumPost = {
  id: number
  topicId: number
  body: string
  createdAt: number
  updatedAt: number | null
  author: ForumAuthor
}

export type ForumTopic = {
  id: number
  boardId: number
  subject: string
  authorName: string
  authorColor: string
  authorRank: RankId
  sticky: boolean
  locked: boolean
  views: number
  replies: number
  createdAt: number
  lastPostAt: number
  lastPosterName: string
  lastPosterColor: string
}

export type ForumBoard = {
  id: number
  categoryId: number
  name: string
  description: string
  position: number
  topics: number
  posts: number
  lastPost: { topicId: number; subject: string; name: string; color: string; at: number; page: number } | null
}

export type ForumCategory = {
  id: number
  name: string
  position: number
  boards: ForumBoard[]
}

export type ForumMe = {
  accountId: string | null
  name: string
  rank: RankId
  rankLabel: string
  color: string
  nameColor: string | null
  colorLocked: boolean
  avatarUrl: string | null
  posts: number
  signature: string
  canPost: boolean
  canModerate: boolean
  canRename: boolean
  guestPosting: boolean
  textMuted: boolean
  postBlock: string | null
}

export type ForumBranding = {
  siteName: string
  forumName: string
}

export const DEFAULT_BRANDING: ForumBranding = { siteName: 'Bitcoin', forumName: 'Bitcoin' }

export type ForumStats = {
  posts: number
  topics: number
  members: number
  latestMember: { name: string; color: string } | null
}

export type ForumOnline = {
  total: number
  guests: number
  members: number
  users: { name: string; rank: string; color: string }[]
}

export type BoardChoice = { id: number; name: string; category: string }

export type ForumEvent =
  | { type: 'post'; topicId: number; boardId: number; post: ForumPost; deleted?: boolean }
  | { type: 'topic'; topicId: number; boardId: number; fromBoardId?: number; deleted?: boolean }
  | { type: 'boards' }
  | { type: 'online'; online: ForumOnline }

const listeners = new Set<(event: ForumEvent) => void>()

export function onForum(listener: (event: ForumEvent) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishForum(event: ForumEvent) {
  for (const listener of listeners) listener(event)
}

export function forumGet<T>(path: string) {
  return api<T>(path)
}

export function forumSend<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function smfDate(ms: number) {
  const date = new Date(ms)
  const hour24 = date.getHours()
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour = hour24 % 12 || 12
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${pad(hour)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${suffix}`
}

export function inkColor(input: string) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : '#1d3a6e'
  let red = Number.parseInt(hex.slice(1, 3), 16)
  let green = Number.parseInt(hex.slice(3, 5), 16)
  let blue = Number.parseInt(hex.slice(5, 7), 16)
  for (let step = 0; step < 10; step += 1) {
    const current = `#${toHex(red)}${toHex(green)}${toHex(blue)}`
    if (contrastOnWhite(current) >= 4.5) return current
    red = Math.round(red * 0.8)
    green = Math.round(green * 0.8)
    blue = Math.round(blue * 0.8)
  }
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')
}

function contrastOnWhite(hex: string) {
  const luminance = channel(hex.slice(1, 3)) * 0.2126 + channel(hex.slice(3, 5)) * 0.7152 + channel(hex.slice(5, 7)) * 0.0722
  return 1.05 / (luminance + 0.05)
}

function channel(pair: string) {
  const value = Number.parseInt(pair, 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export function isForumEvent(value: unknown): value is Exclude<ForumEvent, { type: 'online' }> {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  return type === 'post' || type === 'topic' || type === 'boards'
}

export function isForumOnline(value: unknown): value is ForumOnline {
  if (!value || typeof value !== 'object') return false
  const online = value as ForumOnline
  return typeof online.total === 'number' && Array.isArray(online.users)
}
