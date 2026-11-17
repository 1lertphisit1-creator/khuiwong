export type PriceSymbol = 'BTC' | 'ETH' | 'SOL'

export type PriceQuote = {
  symbol: PriceSymbol
  usd: number
  thb: number | null
  changePct: number
}

export type PriceBoard = {
  quotes: PriceQuote[]
  updatedAt: number
  source: 'binance-ws' | 'binance-rest' | 'coingecko'
  live: boolean
}

const PAIRS: { symbol: PriceSymbol; pair: string }[] = [
  { symbol: 'BTC', pair: 'BTCUSDT' },
  { symbol: 'ETH', pair: 'ETHUSDT' },
  { symbol: 'SOL', pair: 'SOLUSDT' },
]

const STREAM = 'btcusdt@ticker/ethusdt@ticker/solusdt@ticker/usdtthb@ticker'
const WS_URLS = [
  `wss://data-stream.binance.vision/stream?streams=${STREAM}`,
  `wss://stream.binance.com:9443/stream?streams=${STREAM}`,
]
const REST_URLS = [
  'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=',
  'https://api.binance.com/api/v3/ticker/24hr?symbols=',
]

type QuoteDraft = { usd: number; changePct: number }

export class PriceFeed {
  private quotes = new Map<PriceSymbol, QuoteDraft>()
  private thbRate: number | null = null
  private updatedAt = 0
  private thbAt = 0
  private source: PriceBoard['source'] = 'binance-rest'
  private live = false
  private socket: WebSocket | null = null
  private socketIndex = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private backoff = 1000
  private closed = false
  private lastBroadcast = 0
  private onBoard: (board: PriceBoard) => void

  constructor(onBoard: (board: PriceBoard) => void) {
    this.onBoard = onBoard
  }

  start() {
    this.connect()
    this.pollTimer = setInterval(() => {
      void this.refreshThb()
      if (this.live && Date.now() - this.updatedAt < 15_000) return
      void this.pollRest()
    }, 10_000)
    void this.refreshThb()
    void this.pollRest()
  }

  stop() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.socket?.close()
  }

  snapshot(): PriceBoard | null {
    return this.board()
  }

  private board(): PriceBoard | null {
    if (this.quotes.size === 0) return null
    const stale = Date.now() - this.updatedAt > 20_000
    const quotes: PriceQuote[] = PAIRS.flatMap((item) => {
      const quote = this.quotes.get(item.symbol)
      if (!quote) return []
      return [
        {
          symbol: item.symbol,
          usd: quote.usd,
          thb: this.thbRate ? quote.usd * this.thbRate : null,
          changePct: quote.changePct,
        },
      ]
    })
    if (quotes.length === 0) return null
    return {
      quotes,
      updatedAt: this.updatedAt,
      source: this.source,
      live: this.live && !stale,
    }
  }

  private publish(force = false) {
    const board = this.board()
    if (!board) return
    const now = Date.now()
    if (!force && now - this.lastBroadcast < 800) return
    this.lastBroadcast = now
    this.onBoard(board)
  }

  private note(source: PriceBoard['source'], live: boolean) {
    this.source = source
    this.live = live
    this.updatedAt = Date.now()
    this.publish()
  }

  private applyTicker(symbol: string, last: string, change: string) {
    const usd = Number(last)
    const changePct = Number(change)
    if (!Number.isFinite(usd) || usd <= 0) return
    if (symbol === 'USDTTHB') {
      this.thbRate = usd
      return
    }
    const match = PAIRS.find((item) => item.pair === symbol)
    if (!match || !Number.isFinite(changePct)) return
    this.quotes.set(match.symbol, { usd, changePct })
  }

  private connect() {
    if (this.closed) return
    const url = WS_URLS[this.socketIndex % WS_URLS.length] ?? WS_URLS[0]!
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (error) {
      console.warn('[prices] websocket open failed', error)
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.addEventListener('open', () => {
      this.backoff = 1000
      console.log(`[prices] live ${url.includes('vision') ? 'binance.vision' : 'binance'}`)
    })
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as { data?: { s?: string; c?: string; P?: string } }
        const data = payload.data
        if (!data?.s || data.c == null || data.P == null) return
        this.applyTicker(data.s, data.c, data.P)
        this.note('binance-ws', true)
      } catch {
        // Ignore malformed ticks.
      }
    })
    socket.addEventListener('close', () => {
      if (this.socket === socket) this.socket = null
      this.live = false
      this.publish(true)
      this.scheduleReconnect()
    })
    socket.addEventListener('error', () => {
      this.live = false
    })
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, 15_000)
    this.socketIndex += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, wait)
  }

  private async pollRest() {
    if (this.closed) return
    if (await this.pollBinance()) return
    await this.pollCoinGecko()
  }

  private async refreshThb() {
    if (this.thbRate && Date.now() - this.thbAt < 60_000) return
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=thb')
      if (!response.ok) return
      const body = (await response.json()) as { tether?: { thb?: number } }
      const rate = body.tether?.thb
      if (rate && Number.isFinite(rate) && rate > 0) {
        this.thbRate = rate
        this.thbAt = Date.now()
        this.publish()
      }
    } catch {
      // THB is optional when the FX quote is unavailable.
    }
  }

  private async pollBinance() {
    try {
      const symbols = encodeURIComponent('["BTCUSDT","ETHUSDT","SOLUSDT","USDTTHB"]')
      let response: Response | null = null
      for (const base of REST_URLS) {
        const attempt = await fetch(`${base}${symbols}`)
        if (attempt.ok) {
          response = attempt
          break
        }
      }
      if (!response) return false
      const rows = (await response.json()) as { symbol?: string; lastPrice?: string; priceChangePercent?: string }[]
      if (!Array.isArray(rows)) return false
      for (const row of rows) {
        if (!row.symbol || row.lastPrice == null || row.priceChangePercent == null) continue
        this.applyTicker(row.symbol, row.lastPrice, row.priceChangePercent)
      }
      if (this.quotes.size === 0) return false
      this.note('binance-rest', false)
      this.publish(true)
      return true
    } catch (error) {
      console.warn('[prices] binance rest failed', error)
      return false
    }
  }

  private async pollCoinGecko() {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,thb&include_24hr_change=true',
      )
      if (!response.ok) return
      const body = (await response.json()) as Record<string, { usd?: number; thb?: number; usd_24h_change?: number }>
      const map: Record<string, PriceSymbol> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' }
      let rate: number | null = null
      for (const [id, symbol] of Object.entries(map)) {
        const row = body[id]
        if (!row?.usd || !Number.isFinite(row.usd)) continue
        this.quotes.set(symbol, { usd: row.usd, changePct: row.usd_24h_change ?? 0 })
        if (row.thb && row.usd > 0) rate = row.thb / row.usd
      }
      if (rate) this.thbRate = rate
      if (this.quotes.size === 0) return
      this.note('coingecko', false)
      this.publish(true)
    } catch (error) {
      console.warn('[prices] coingecko failed', error)
    }
  }
}
