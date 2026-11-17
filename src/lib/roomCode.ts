const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function createRoomCode() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
}

export function extractRoomCode(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    const match = url.pathname.match(/\/room\/([A-Za-z0-9]{4,8})\/?$/i)
    if (match?.[1]) return match[1].toUpperCase()
  } catch {
    // Not a URL. Fall through to a raw code.
  }
  const inline = trimmed.match(/room\/([A-Za-z0-9]{4,8})/i)
  if (inline?.[1]) return inline[1].toUpperCase()
  const code = trimmed.toUpperCase().replace(/\s+/g, '')
  if (/^[A-Z0-9]{4,8}$/.test(code)) return code
  return null
}

export function cleanDisplayName(input: string) {
  let stripped = ''
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) continue
    stripped += char
  }
  const name = stripped.trim().replace(/\s+/g, ' ')
  const chars = [...name]
  if (chars.length < 1 || chars.length > 24) return null
  return chars.join('')
}
