import { useEffect, useState } from 'react'
import { onPrices, type PriceBoard } from '@/lib/prices.ts'

const ORDER = ['BTC', 'ETH', 'SOL', 'AVAX', 'NEAR', 'INJ', 'ZEC', 'DOGE', 'ADA', 'XRP', 'WLD', 'UNI', 'XAU'] as const
type Symbol = (typeof ORDER)[number]

export function PriceWatchlist() {
  const [board, setBoard] = useState<PriceBoard | null>(null)

  useEffect(() => {
    let stopped = false
    void fetch('/api/prices')
      .then((response) => (response.ok ? (response.json() as Promise<PriceBoard>) : null))
      .then((payload) => {
        if (!stopped && payload) setBoard(payload)
      })
      .catch(() => {})
    const stop = onPrices((next) => {
      if (!stopped) setBoard(next)
    })
    return () => {
      stopped = true
      stop()
    }
  }, [])

  const bySymbol = new Map((board?.quotes ?? []).map((quote) => [quote.symbol, quote]))

  return (
    <section className="smf-block smf-prices" data-testid="price-watchlist">
      <div className="smf-cat">Markets</div>
      <table className="smf-table">
        <thead>
          <tr className="smf-title">
            <th>Coin</th>
            <th className="smf-price-num">Price (USD)</th>
            <th className="smf-price-num">24h %</th>
          </tr>
        </thead>
        <tbody>
          {ORDER.map((symbol, index) => {
            const quote = bySymbol.get(symbol)
            const up = (quote?.changePct ?? 0) >= 0
            return (
              <tr key={symbol} className={index % 2 === 0 ? 'windowbg' : 'windowbg2'} data-symbol={symbol}>
                <td>{symbol}</td>
                <td className="smf-price-num">{quote ? money(symbol, quote.usd) : '—'}</td>
                <td className={`smf-price-num ${quote ? (up ? 'smf-price-up' : 'smf-price-down') : ''}`}>
                  {quote ? `${up ? '+' : ''}${quote.changePct.toFixed(2)}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function money(symbol: Symbol, value: number) {
  const digits = ['DOGE', 'ADA', 'XRP', 'WLD'].includes(symbol) || value < 1 ? 4 : value >= 1000 ? 0 : 2
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
