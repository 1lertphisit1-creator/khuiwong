import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

type Fund = { ticker: string; usd: number | null; coin?: number | null }
type Asset = {
  asset: 'BTC' | 'ETH'
  date: string
  totalUsd: number
  totalCoin?: number | null
  approximate?: boolean
  priceBasis?: 'close' | 'live' | null
  funds: Fund[]
  history: { date: string; totalUsd: number; totalCoin?: number | null }[]
}
type Board = {
  btc: Asset | null
  eth: Asset | null
  updatedAt: number
  source: string
  sourceUrl: string
  stale: boolean
  message: string | null
}

export function EtfFlowCard() {
  const [board, setBoard] = useState<Board | null>(null)
  const [asset, setAsset] = useState<'BTC' | 'ETH'>('BTC')

  useEffect(() => {
    let stopped = false
    const apply = (next: Board) => {
      if (!stopped) setBoard(next)
    }
    void fetch('/api/etf-flows')
      .then((response) => (response.ok ? (response.json() as Promise<Board>) : null))
      .then((payload) => {
        if (payload) apply(payload)
      })
      .catch(() => {})
    const socket = io({ transports: ['websocket', 'polling'], reconnection: true })
    socket.on('etf-flows', apply)
    return () => {
      stopped = true
      socket.close()
    }
  }, [])

  const current = asset === 'BTC' ? board?.btc : board?.eth
  const updated = board?.updatedAt
    ? new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(board.updatedAt)
    : null

  return (
    <section data-testid="etf-flow" className="ornament-panel rounded-[1.4rem] p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-base font-bold text-gold">ETF Flow</h2>
        <div className="ml-auto flex rounded-full border border-gold/30 p-0.5 text-xs">
          {(['BTC', 'ETH'] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`etf-tab-${id}`}
              className={`rounded-full px-2.5 py-1 ${asset === id ? 'bg-gold text-ink' : 'text-cream'}`}
              onClick={() => setAsset(id)}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      {!current ? (
        <p className="mt-3 text-sm text-muted-foreground">{board?.message || 'ยังไม่มีข้อมูลวันนี้'}</p>
      ) : (
        <>
          <p className="mt-2 text-[11px] tracking-wide text-muted-foreground">{current.date}</p>
          <p className={`font-display text-2xl font-bold tabular-nums ${tone(current.totalCoin ?? current.totalUsd)}`}>
            {current.totalCoin == null ? money(current.totalUsd) : `${current.approximate ? '≈ ' : ''}${coinLabel(current.totalCoin, current.asset, true)}`}
          </p>
          {current.totalCoin != null ? <p className="text-[11px] tabular-nums text-muted-foreground">{money(current.totalUsd)}</p> : null}
          {current.priceBasis === 'live' ? <p className="text-[10px] text-[#e0c17a]">ใช้ราคาปัจจุบัน</p> : null}
          <Sparkline history={current.history} />
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
            {current.funds.map((fund) => {
              const value = fund.coin ?? null
              return (
                <li key={fund.ticker} className="flex items-center justify-between gap-2">
                  <span className="text-cream">{fund.ticker}</span>
                  <span className={`tabular-nums ${value == null ? 'text-muted-foreground' : tone(value)}`}>
                    {value == null ? '—' : coinLabel(value, current.asset, false)}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <p className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>อัปเดตล่าสุด {updated ?? '—'}</span>
        <a href={board?.sourceUrl || 'https://farside.co.uk/'} target="_blank" rel="noopener noreferrer" className="text-gold">
          Farside
        </a>
      </p>
      {board?.stale ? <p className="text-[10px] text-[#e0c17a]">ข้อมูลเก่า</p> : null}
    </section>
  )
}

function Sparkline({ history }: { history: { date: string; totalUsd: number; totalCoin?: number | null }[] }) {
  if (history.length < 2) return null
  const useCoin = history.every((day) => typeof day.totalCoin === 'number')
  const amount = (day: { totalUsd: number; totalCoin?: number | null }) => (useCoin ? day.totalCoin ?? 0 : day.totalUsd)
  const max = Math.max(...history.map((day) => Math.abs(amount(day))), 1)
  return (
    <div className="mt-2 flex h-8 items-end gap-1" aria-hidden="true">
      {history.map((day) => {
        const value = amount(day)
        const height = Math.max(2, (Math.abs(value) / max) * 32)
        return (
          <span
            key={day.date}
            title={day.date}
            className={`w-2 rounded-sm ${value >= 0 ? 'bg-[#8dcea8]' : 'bg-[#e08b8b]'}`}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function coinLabel(value: number, unit: 'BTC' | 'ETH', withUnit: boolean) {
  if (value === 0) return withUnit ? `0 ${unit}` : '0'
  const sign = value > 0 ? '+' : '−'
  const abs = Math.abs(value)
  const digits = unit === 'BTC' ? (abs >= 100 ? 1 : abs >= 1 ? 2 : 4) : abs >= 100 ? 0 : abs >= 1 ? 1 : 3
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return withUnit ? `${sign}${body} ${unit}` : `${sign}${body}`
}

function tone(value: number) {
  if (value > 0) return 'text-[#8dcea8]'
  if (value < 0) return 'text-[#e08b8b]'
  return 'text-cream'
}

function money(usd: number) {
  const sign = usd > 0 ? '+' : usd < 0 ? '−' : ''
  return `${sign}$${compact(Math.abs(usd))}`
}

function compact(usd: number) {
  const abs = Math.abs(usd)
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`
  return abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
