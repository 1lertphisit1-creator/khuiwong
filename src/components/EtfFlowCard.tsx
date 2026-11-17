import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

type Fund = { ticker: string; usd: number | null }
type Asset = {
  asset: 'BTC' | 'ETH'
  date: string
  totalUsd: number
  funds: Fund[]
  history: { date: string; totalUsd: number }[]
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
          <p className={`font-display text-2xl font-bold tabular-nums ${current.totalUsd >= 0 ? 'text-[#8dcea8]' : 'text-[#e08b8b]'}`}>
            {money(current.totalUsd)}
          </p>
          <Sparkline history={current.history} />
          <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
            {current.funds.map((fund) => (
              <li key={fund.ticker} className="flex items-center justify-between gap-2">
                <span className="text-cream">{fund.ticker}</span>
                <span className={`tabular-nums ${fund.usd == null ? 'text-muted-foreground' : fund.usd > 0 ? 'text-[#8dcea8]' : fund.usd < 0 ? 'text-[#e08b8b]' : 'text-cream'}`}>
                  {fund.usd == null ? '—' : signed(fund.usd)}
                </span>
              </li>
            ))}
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

function Sparkline({ history }: { history: { date: string; totalUsd: number }[] }) {
  if (history.length < 2) return null
  const max = Math.max(...history.map((day) => Math.abs(day.totalUsd)), 1)
  return (
    <div className="mt-2 flex h-8 items-end gap-1" aria-hidden="true">
      {history.map((day) => {
        const height = Math.max(2, (Math.abs(day.totalUsd) / max) * 32)
        return (
          <span
            key={day.date}
            title={day.date}
            className={`w-2 rounded-sm ${day.totalUsd >= 0 ? 'bg-[#8dcea8]' : 'bg-[#e08b8b]'}`}
            style={{ height }}
          />
        )
      })}
    </div>
  )
}

function money(usd: number) {
  const sign = usd > 0 ? '+' : usd < 0 ? '−' : ''
  return `${sign}$${compact(Math.abs(usd))}`
}

function signed(usd: number) {
  const sign = usd > 0 ? '+' : usd < 0 ? '−' : ''
  return `${sign}${compact(Math.abs(usd))}`
}

function compact(usd: number) {
  const abs = Math.abs(usd)
  if (abs >= 1_000_000_000) return `${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`
  return abs.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
