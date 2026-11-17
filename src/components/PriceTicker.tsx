import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

type Quote = {
  symbol: 'BTC' | 'ETH' | 'SOL'
  usd: number
  thb: number | null
  changePct: number
}

type Board = {
  quotes: Quote[]
  updatedAt: number
  source: string
  live: boolean
}

export function PriceTicker() {
  const [board, setBoard] = useState<Board | null>(null)
  const [flash, setFlash] = useState<Partial<Record<Quote['symbol'], number>>>({})
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
        const changed: Partial<Record<Quote['symbol'], number>> = {}
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

  const age = board ? Math.max(0, now - board.updatedAt) : null
  const stale = age == null || age > 20_000
  const status = !board ? 'กำลังรอราคา' : stale ? 'ข้อมูลช้า' : board.live ? 'LIVE' : 'อัปเดตแล้ว'

  return (
    <div
      data-testid="price-ticker"
      data-live={board?.live && !stale ? 'true' : 'false'}
      className="relative z-20 border-b border-gold/40 bg-[#2a1218]/95 text-cream backdrop-blur"
    >
      <div className="flex items-center gap-3 px-3 py-1.5">
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] ${
            board?.live && !stale ? 'bg-rose text-paper' : 'bg-ink text-gold'
          }`}
        >
          {status}
        </span>
        <div className="app-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {(board?.quotes ?? PLACEHOLDERS).map((quote) => (
            <QuoteChip key={quote.symbol} quote={quote} flashKey={flash[quote.symbol] ?? 0} waiting={!board} />
          ))}
        </div>
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
          {age == null ? 'ยังไม่ได้รับราคา' : `${Math.round(age / 1000)} วิ`}
        </span>
      </div>
    </div>
  )
}

const PLACEHOLDERS: Quote[] = [
  { symbol: 'BTC', usd: 0, thb: null, changePct: 0 },
  { symbol: 'ETH', usd: 0, thb: null, changePct: 0 },
  { symbol: 'SOL', usd: 0, thb: null, changePct: 0 },
]

function QuoteChip({ quote, flashKey, waiting }: { quote: Quote; flashKey: number; waiting: boolean }) {
  const up = quote.changePct >= 0
  return (
    <div
      key={flashKey}
      data-symbol={quote.symbol}
      className={`flex shrink-0 items-center gap-2 rounded-full border border-gold/30 bg-ink/70 px-2.5 py-1 ${
        flashKey ? 'price-flash' : ''
      }`}
    >
      <span className="font-display text-xs font-bold text-gold">{quote.symbol}</span>
      <span className="text-sm tabular-nums">{waiting ? '—' : usd(quote.usd)}</span>
      {quote.thb != null && !waiting ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">{thb(quote.thb)}</span>
      ) : null}
      <span className={`text-[11px] font-medium tabular-nums ${waiting ? 'text-muted-foreground' : up ? 'text-[#8dcea8]' : 'text-[#e08b8b]'}`}>
        {waiting ? '' : up ? '▲' : '▼'} {waiting ? '—' : `${up ? '+' : ''}${quote.changePct.toFixed(2)}%`}
      </span>
    </div>
  )
}

function usd(value: number) {
  const digits = value >= 1000 ? 0 : 2
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function thb(value: number) {
  const digits = value >= 1000 ? 0 : 2
  return `฿${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}
