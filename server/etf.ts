import { readCache, writeCache } from './db.ts'

export type EtfFund = { ticker: string; usd: number | null }
export type EtfDay = { date: string; totalUsd: number; funds: EtfFund[] }
export type EtfAsset = {
  asset: 'BTC' | 'ETH'
  date: string
  totalUsd: number
  funds: EtfFund[]
  history: { date: string; totalUsd: number }[]
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
      const [btc, eth] = await Promise.all([this.loadAsset('BTC'), this.loadAsset('ETH')])
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
      funds: funds.map((fund) => ({ ticker: fund.ticker, usd: fund.usd == null ? null : fund.usd * 1_000_000 })),
    })
  }
  if (days.length === 0) return null
  const latest = days[days.length - 1]!
  return {
    asset,
    date: latest.date,
    totalUsd: latest.totalUsd,
    funds: latest.funds,
    history: days.slice(-7).map((day) => ({ date: day.date, totalUsd: day.totalUsd })),
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
