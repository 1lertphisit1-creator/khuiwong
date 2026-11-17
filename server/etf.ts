import { readCache, writeCache } from './db.ts'

export type EtfFund = { ticker: string; usd: number | null; coin: number | null }
export type EtfDay = { date: string; totalUsd: number; totalCoin: number | null; funds: EtfFund[] }
export type EtfAsset = {
  asset: 'BTC' | 'ETH'
  date: string
  totalUsd: number
  totalCoin: number | null
  approximate: boolean
  priceUsd: number | null
  priceBasis: 'close' | 'live' | null
  funds: EtfFund[]
  history: { date: string; totalUsd: number; totalCoin: number | null }[]
}
export type EtfBoard = {
  btc: EtfAsset | null
  eth: EtfAsset | null
  updatedAt: number
  source: 'farside' | 'farside-archive' | 'cache'
  sourceUrl: string
  stale: boolean
  message: string | null
}

const CACHE_KEY = 'etf-flows'
const USER_AGENT = 'Mozilla/5.0 (compatible; Khuiwong/1.0; +https://khuiwong.onrender.com)'
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}
const PAGES = {
  BTC: { live: 'https://farside.co.uk/btc/', credit: 'https://farside.co.uk/btc/' },
  ETH: { live: 'https://farside.co.uk/eth/', credit: 'https://farside.co.uk/eth/' },
} as const

const SKIP = new Set(['fee', 'total', 'average', 'maximum', 'minimum', ''])

export class EtfFeed {
  board: EtfBoard | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private onBoard: (board: EtfBoard) => void

  constructor(onBoard: (board: EtfBoard) => void) {
    this.onBoard = onBoard
    const cached = readCache(CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached.payload) as EtfBoard
        this.board = parsed
      } catch {
        this.board = null
      }
    }
  }

  start() {
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), 45 * 60 * 1000)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  async refresh() {
    try {
      const [btcRaw, ethRaw] = await Promise.all([this.loadAsset('BTC'), this.loadAsset('ETH')])
      const [btc, eth] = await Promise.all([
        btcRaw.asset ? priceAsset(btcRaw.asset).then((asset) => ({ ...btcRaw, asset })) : Promise.resolve(btcRaw),
        ethRaw.asset ? priceAsset(ethRaw.asset).then((asset) => ({ ...ethRaw, asset })) : Promise.resolve(ethRaw),
      ])
      if (!btc.asset && !eth.asset) throw new Error('empty')
      const source = btc.source === 'farside' || eth.source === 'farside' ? 'farside' : 'farside-archive'
      const board: EtfBoard = {
        btc: btc.asset,
        eth: eth.asset,
        updatedAt: Date.now(),
        source,
        sourceUrl: 'https://farside.co.uk/',
        stale: false,
        message: btc.asset && eth.asset ? null : 'บางส่วนยังไม่มีข้อมูลวันนี้',
      }
      this.board = board
      writeCache(CACHE_KEY, JSON.stringify(board), board.updatedAt)
      this.onBoard(board)
      console.log(`[etf] ${source} btc=${board.btc?.date ?? '-'} eth=${board.eth?.date ?? '-'}`)
    } catch (error) {
      console.warn('[etf] refresh failed', error instanceof Error ? error.message : error)
      if (this.board) {
        const stale = { ...this.board, stale: true, source: 'cache' as const }
        this.board = stale
        this.onBoard(stale)
      }
    }
  }

  private async loadAsset(asset: 'BTC' | 'ETH') {
    const page = PAGES[asset]
    const live = await fetchHtml(page.live)
    const liveAsset = live ? parseAsset(asset, live) : null
    if (liveAsset) return { asset: liveAsset, source: 'farside' as const }
    const archived = await fetchArchive(page.live)
    const archivedAsset = archived ? parseAsset(asset, archived) : null
    return { asset: archivedAsset, source: 'farside-archive' as const }
  }
}

async function fetchHtml(url: string) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
    })
    if (!response.ok) return null
    const html = await response.text()
    if (!html.includes('class="etf"') && !html.includes("class='etf'")) return null
    return html
  } catch {
    return null
  }
}

async function fetchArchive(url: string) {
  try {
    const available = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!available.ok) return null
    const body = (await available.json()) as { archived_snapshots?: { closest?: { url?: string; available?: boolean } } }
    const snap = body.archived_snapshots?.closest
    if (!snap?.available || !snap.url) return null
    const raw = snap.url.replace('/web/', '/web/').includes('id_/')
      ? snap.url
      : snap.url.replace(/\/web\/(\d+)\//, '/web/$1id_/')
    return await fetchHtml(raw.startsWith('http://') ? `https://${raw.slice('http://'.length)}` : raw)
  } catch {
    return null
  }
}

export function parseAsset(asset: 'BTC' | 'ETH', html: string): EtfAsset | null {
  const table = html.match(/<table[^>]*class=["'][^"']*\betf\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1]
  if (!table) return null
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cell[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
    ),
  )
  const header = rows.find((row) => row.some((cell) => cell === 'IBIT' || cell === 'ETHA'))
  if (!header) return null
  const tickers = header.slice(1, -1)
  const days: EtfDay[] = []
  for (const row of rows) {
    const date = toIso(row[0] ?? '')
    if (!date) continue
    const values = row.slice(1)
    const totalRaw = values[values.length - 1]
    const total = parseFlow(totalRaw ?? '')
    if (total == null) continue
    const funds = tickers.map((ticker, index) => ({
      ticker,
      usd: parseFlow(values[index] ?? ''),
    })).filter((fund) => fund.ticker && !SKIP.has(fund.ticker.toLowerCase()))
    days.push({
      date,
      totalUsd: total * 1_000_000,
      totalCoin: null,
      funds: funds.map((fund) => ({ ticker: fund.ticker, usd: fund.usd == null ? null : fund.usd * 1_000_000, coin: null })),
    })
  }
  if (days.length === 0) return null
  const latest = days[days.length - 1]!
  const history = days.slice(-7)
  return {
    asset,
    date: latest.date,
    totalUsd: latest.totalUsd,
    totalCoin: null,
    approximate: false,
    priceUsd: null,
    priceBasis: null,
    funds: latest.funds,
    history: history.map((day) => ({ date: day.date, totalUsd: day.totalUsd, totalCoin: null })),
  }
}

const KLINE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']

async function priceAsset(asset: EtfAsset): Promise<EtfAsset> {
  const symbol = asset.asset === 'BTC' ? 'BTCUSDT' : 'ETHUSDT'
  const dates = asset.history.map((day) => day.date)
  const closes = await dailyCloses(symbol, dates)
  const missing = dates.some((date) => !closes.has(date))
  const spot = missing ? await spotPrice(symbol) : null
  const latestPrice = closes.get(asset.date) ?? spot
  const priceBasis = closes.has(asset.date) ? 'close' : spot ? 'live' : null
  const funds = asset.funds.map((fund) => ({
    ...fund,
    coin: toCoin(fund.usd, latestPrice),
  }))
  const history = asset.history.map((day) => {
    const price = closes.get(day.date) ?? spot
    return { ...day, totalCoin: toCoin(day.totalUsd, price) }
  })
  return {
    ...asset,
    totalCoin: toCoin(asset.totalUsd, latestPrice),
    approximate: latestPrice != null,
    priceUsd: latestPrice,
    priceBasis,
    funds,
    history,
  }
}

function toCoin(usd: number | null, price: number | null) {
  if (usd == null || price == null || !(price > 0)) return null
  return usd / price
}

async function dailyCloses(symbol: string, dates: string[]) {
  const found = new Map<string, number>()
  if (dates.length === 0) return found
  const start = Date.parse(`${dates[0]}T00:00:00Z`)
  const end = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 86_400_000
  if (!Number.isFinite(start) || !Number.isFinite(end)) return found
  for (const host of KLINE_HOSTS) {
    try {
      const response = await fetch(
        `${host}/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${start}&endTime=${end}&limit=30`,
        { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } },
      )
      if (!response.ok) continue
      const rows = (await response.json()) as unknown
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 5) continue
        const open = Number(row[0])
        const close = Number(row[4])
        if (!Number.isFinite(open) || !(close > 0)) continue
        found.set(new Date(open).toISOString().slice(0, 10), close)
      }
      if (found.size > 0) return found
    } catch {
      // Try the next public host.
    }
  }
  return found
}

async function spotPrice(symbol: string) {
  for (const host of KLINE_HOSTS) {
    try {
      const response = await fetch(`${host}/api/v3/ticker/price?symbol=${symbol}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      })
      if (!response.ok) continue
      const body = (await response.json()) as { price?: string }
      const price = Number(body.price)
      if (price > 0) return price
    } catch {
      // Try the next public host.
    }
  }
  try {
    const id = symbol === 'BTCUSDT' ? 'bitcoin' : 'ethereum'
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    })
    if (!response.ok) return null
    const body = (await response.json()) as Record<string, { usd?: number }>
    const price = Number(body[id]?.usd)
    return price > 0 ? price : null
  } catch {
    return null
  }
}

function parseFlow(value: string) {
  const text = value.replace(/,/g, '').trim()
  if (!text || text === '-' || text === '—') return null
  const negative = /^\(.*\)$/.test(text)
  const number = Number(text.replace(/[()]/g, ''))
  if (!Number.isFinite(number)) return null
  return negative ? -number : number
}

function toIso(value: string) {
  const match = value.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (!match) return null
  const month = MONTHS[match[2]!.toLowerCase()]
  if (!month) return null
  return `${match[3]}-${month}-${match[1]!.padStart(2, '0')}`
}
