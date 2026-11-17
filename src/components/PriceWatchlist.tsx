import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const ORDER = ['BTC', 'ETH', 'SOL', 'AVAX', 'NEAR', 'INJ', 'ZEC', 'DOGE', 'ADA', 'XRP', 'WLD', 'UNI', 'XAU'] as const
type Symbol = (typeof ORDER)[number]

type Quote = {
  symbol: Symbol
  usd: number
  thb: number | null
  changePct: number
  spark?: number[]
}

type Board = {
  quotes: Quote[]
  updatedAt: number
  source: string
  live: boolean
}

export function PriceWatchlist() {
  const [board, setBoard] = useState<Board | null>(null)
  const [flash, setFlash] = useState<Partial<Record<Symbol, number>>>({})
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let stopped = false
    const apply = (next: Board) => {
      if (stopped) return
      setBoard((current) => {
        const changed: Partial<Record<Symbol, number>> = {}
        for (const quote of next.quotes) {
          const previous = current?.quotes.find((item) => item.symbol === quote.symbol)
          if (previous && previous.usd !== quote.usd) changed[quote.symbol] = next.updatedAt
        }
        if (Object.keys(changed).length > 0) setFlash((existing) => ({ ...existing, ...changed }))
        return next
      })
    }
    void fetch('/api/prices')
      .then((response) => (response.ok ? (response.json() as Promise<Board>) : null))
      .then((payload) => {
        if (payload) apply(payload)
      })
      .catch(() => {})
    const socket = io({ transports: ['websocket', 'polling'], reconnection: true })
    socket.on('prices', apply)
    return () => {
      stopped = true
      socket.close()
    }
  }, [])

  const bySymbol = new Map((board?.quotes ?? []).map((quote) => [quote.symbol, quote]))
  const age = board ? Math.max(0, now - board.updatedAt) : null
  const stale = age == null || age > 20_000
  const live = Boolean(board?.live && !stale)

  return (
    <section
      data-testid="price-watchlist"
      data-live={live ? 'true' : 'false'}
      className="ornament-panel flex max-h-full min-h-0 flex-col overflow-hidden rounded-2xl lg:max-h-[22rem]"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <h2 className="font-display text-base font-bold text-gold">ราคา</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${live ? 'bg-rose text-paper' : 'bg-ink text-gold'}`}>
          {!board ? 'รอ' : stale ? 'ข้อมูลช้า' : live ? 'LIVE' : 'REST'}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{age == null ? '—' : `${Math.round(age / 1000)} วิ`}</span>
      </header>
      <ul className="app-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {ORDER.map((symbol) => (
          <Row key={symbol} symbol={symbol} quote={bySymbol.get(symbol) ?? null} flashKey={flash[symbol] ?? 0} />
        ))}
      </ul>
    </section>
  )
}

function Row({ symbol, quote, flashKey }: { symbol: Symbol; quote: Quote | null; flashKey: number }) {
  const up = (quote?.changePct ?? 0) >= 0
  return (
    <li
      key={flashKey}
      data-symbol={symbol}
      className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl px-2 py-1 ${flashKey ? 'price-flash' : ''}`}
    >
      <span className="flex items-center gap-1.5">
        <span className="grid h-6 w-6 place-items-center rounded-full border border-gold/40 bg-ink text-[9px] font-bold text-gold">
          {symbol.slice(0, 1)}
        </span>
        <span className="leading-tight">
          <span className="block font-display text-xs font-bold text-cream">{symbol}</span>
          {symbol === 'XAU' ? <span className="block text-[9px] text-muted-foreground">ทองคำ</span> : null}
        </span>
      </span>
      <span className="text-right text-sm tabular-nums">{quote ? money(symbol, quote.usd) : '—'}</span>
      <span className="flex items-center justify-end gap-1">
        <Spark values={quote?.spark ?? []} up={up} />
        <span className={`w-16 text-right text-[11px] font-medium tabular-nums ${quote ? (up ? 'text-[#8dcea8]' : 'text-[#e08b8b]') : 'text-muted-foreground'}`}>
          {quote ? `${up ? '▲' : '▼'} ${up ? '+' : ''}${quote.changePct.toFixed(2)}%` : '—'}
        </span>
      </span>
    </li>
  )
}

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <span className="inline-block w-9" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 36
      const y = 14 - ((value - min) / span) * 12
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={up ? '#8dcea8' : '#e08b8b'} strokeWidth="1.4" />
    </svg>
  )
}

function money(symbol: Symbol, value: number) {
  const digits = ['DOGE', 'ADA', 'XRP', 'WLD'].includes(symbol) || value < 1 ? 4 : value >= 1000 ? 0 : 2
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}
