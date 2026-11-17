import type { MediaResult } from './media.ts'

export const NAME_KEY = 'khuiwong.displayName'

export type StagedEntry = {
  code: string
  name: string
  media: MediaResult
}

let staged: StagedEntry | null = null

export function stageEntry(entry: StagedEntry) {
  staged = entry
}

export function peekEntry(code: string) {
  if (staged?.code === code) return staged
  return null
}

export function clearEntry() {
  staged = null
}

export function storedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private mode can reject storage. The name still works for this visit.
  }
}
