export function parseNameColor(input: unknown): { color: string | null } | { error: string } {
  if (input == null || input === '') return { color: null }
  if (typeof input !== 'string') return { error: 'ใส่สีเป็นรหัส hex เช่น #1d3a6e' }
  const hex = expandHex(input.trim())
  if (!hex) return { error: 'ใส่สีเป็นรหัส hex เช่น #1d3a6e' }
  if (contrastOnWhite(hex) < 4.5) return { error: 'สีนี้จางเกินไปบนพื้นหลังสีอ่อน เลือกสีที่เข้มขึ้น' }
  return { color: hex }
}

export function storedHex(value: string | null | undefined) {
  if (!value) return null
  const hex = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null
}

function expandHex(value: string) {
  const match = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (!match?.[1]) return null
  const body = match[1]
  const full = body.length === 3 ? body.replace(/./g, (char) => char + char) : body
  return `#${full.toLowerCase()}`
}

function contrastOnWhite(hex: string) {
  const luminance = channel(hex.slice(1, 3)) * 0.2126 + channel(hex.slice(3, 5)) * 0.7152 + channel(hex.slice(5, 7)) * 0.0722
  return 1.05 / (luminance + 0.05)
}

function channel(pair: string) {
  const value = Number.parseInt(pair, 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
