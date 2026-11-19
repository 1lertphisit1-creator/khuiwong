export type PriceQuote = {
  symbol: string
  usd: number
  thb: number | null
  changePct: number
}

export type PriceBoard = {
  quotes: PriceQuote[]
  updatedAt: number
  source: string
  live: boolean
}

const listeners = new Set<(board: PriceBoard) => void>()

export function onPrices(listener: (board: PriceBoard) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishPrices(board: PriceBoard) {
  for (const listener of listeners) listener(board)
}

export function isPriceBoard(value: unknown): value is PriceBoard {
  if (!value || typeof value !== 'object') return false
  return Array.isArray((value as PriceBoard).quotes)
}
