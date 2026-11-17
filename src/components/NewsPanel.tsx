import { useEffect, useRef, useState, type ReactNode } from 'react'
import { io } from 'socket.io-client'
import { Button } from '@/components/ui/button.tsx'

type NewsPost = {
  id: string
  text: string
  createdAt: string
  url: string
}

type NewsConfig = {
  facebookPage: string
  xHandle: string
  xUrl: string
  xApi: boolean
  posts?: NewsPost[]
}

type Tab = 'facebook' | 'x'

const DEFAULTS: NewsConfig = {
  facebookPage: 'https://www.facebook.com/bitcoin.chiangrai',
  xHandle: 'WatcherGuru',
  xUrl: 'https://x.com/WatcherGuru',
  xApi: false,
}

export function NewsPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('facebook')
  const [config, setConfig] = useState<NewsConfig>(DEFAULTS)
  const [posts, setPosts] = useState<NewsPost[]>([])
  const [fresh, setFresh] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const seen = useRef(new Set<string>())

  useEffect(() => {
    void fetch('/api/news')
      .then((response) => (response.ok ? (response.json() as Promise<NewsConfig>) : null))
      .then((payload) => {
        if (!payload) return
        setConfig(payload)
        if (payload.posts?.length) {
          setPosts(payload.posts)
          for (const post of payload.posts) seen.current.add(post.id)
        }
      })
      .catch(() => {})

    const socket = io({ transports: ['websocket', 'polling'], reconnection: true })
    socket.on('news-posts', (next: NewsPost[]) => {
      if (!Array.isArray(next)) return
      const unseen = next.filter((post) => !seen.current.has(post.id)).length
      for (const post of next) seen.current.add(post.id)
      setPosts(next)
      if (unseen > 0) setFresh((count) => count + unseen)
    })
    return () => {
      socket.close()
    }
  }, [])

  function toggle() {
    setOpen((value) => !value)
    setFresh(0)
  }

  return (
    <>
      <button
        type="button"
        data-testid="open-news"
        aria-expanded={open}
        className="fixed top-20 right-3 z-30 rounded-full border border-gold/50 bg-[#3d1822] px-3 py-1.5 text-sm font-medium text-gold shadow-lg"
        onClick={toggle}
      >
        ข่าว
        {fresh > 0 ? <span className="ml-1 rounded-full bg-rose px-1.5 text-[10px] text-paper">{fresh}</span> : null}
      </button>
      {open ? (
        <section
          data-testid="news-panel"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[72dvh] flex-col border border-gold/45 bg-[#2a1218] shadow-2xl md:inset-x-auto md:top-14 md:right-3 md:bottom-3 md:h-auto md:w-[min(400px,calc(100vw-1.5rem))] md:rounded-2xl"
        >
          <header className="flex items-center gap-2 border-b border-gold/30 px-3 py-2">
            <h2 className="font-display text-lg font-bold text-gold">ข่าว Crypto</h2>
            <Button type="button" size="sm" variant="secondary" data-testid="news-refresh" onClick={() => setReloadKey((key) => key + 1)}>
              รีเฟรช
            </Button>
            <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setOpen(false)}>
              ปิด
            </Button>
          </header>
          <div className="grid grid-cols-2 gap-2 px-3 pt-2" role="tablist">
            <TabButton current={tab} id="facebook" onSelect={setTab}>
              Facebook
            </TabButton>
            <TabButton current={tab} id="x" onSelect={setTab}>
              X · @{config.xHandle}
            </TabButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'facebook' ? (
              <FacebookTimeline key={`fb-${reloadKey}`} pageUrl={config.facebookPage} />
            ) : (
              <div className="space-y-3">
                {posts.length > 0 ? <PostList posts={posts} /> : null}
                <XTimeline key={`x-${reloadKey}`} handle={config.xHandle} url={config.xUrl} />
              </div>
            )}
          </div>
        </section>
      ) : null}
    </>
  )
}

function TabButton({
  current,
  id,
  onSelect,
  children,
}: {
  current: Tab
  id: Tab
  onSelect: (id: Tab) => void
  children: ReactNode
}) {
  const active = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={`news-tab-${id}`}
      className={`rounded-full border px-2 py-1.5 text-sm ${active ? 'border-gold bg-gold text-ink' : 'border-gold/30 text-cream'}`}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  )
}

function FacebookTimeline({ pageUrl }: { pageUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let stopped = false
    const started = Date.now()
    void loadFacebook().then(() => {
      if (stopped) return
      const fb = (window as Window & { FB?: { XFBML?: { parse: (node: HTMLElement) => void } } }).FB
      fb?.XFBML?.parse(root)
    })
    const timer = window.setInterval(() => {
      const frame = root.querySelector('iframe')
      const height = frame?.getBoundingClientRect().height ?? 0
      if (frame && height > 80) {
        setFailed(false)
        window.clearInterval(timer)
        return
      }
      if (Date.now() - started > 8000) setFailed(true)
    }, 500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [pageUrl])

  return (
    <div data-testid="news-facebook">
      <div ref={rootRef}>
        <div
          className="fb-page"
          data-href={pageUrl}
          data-tabs="timeline"
          data-width="360"
          data-height="520"
          data-small-header="true"
          data-adapt-container-width="true"
          data-hide-cover="false"
          data-show-facepile="false"
        >
          <blockquote cite={pageUrl} className="fb-xfbml-parse-ignore">
            <a href={pageUrl}>Bitcoin Chiang Rai</a>
          </blockquote>
        </div>
      </div>
      {failed ? (
        <a
          data-testid="news-facebook-fallback"
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-2xl border border-gold/40 bg-ink/70 p-4 text-sm text-cream"
        >
          ฟีด Facebook ยังโหลดไม่ขึ้นในหน้านี้
          <span className="mt-2 block font-medium text-gold">เปิดเพจ Bitcoin Chiang Rai</span>
        </a>
      ) : null}
    </div>
  )
}

function XTimeline({ handle, url }: { handle: string; url: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let stopped = false
    const started = Date.now()
    void loadTwitter().then(() => {
      if (stopped) return
      const twttr = (window as Window & { twttr?: { widgets?: { load: (node?: HTMLElement) => void } } }).twttr
      twttr?.widgets?.load(root)
    })
    const timer = window.setInterval(() => {
      const frame = root.querySelector('iframe')
      const height = frame?.getBoundingClientRect().height ?? 0
      if (frame && height > 80) {
        setFailed(false)
        window.clearInterval(timer)
        return
      }
      if (Date.now() - started > 8000) setFailed(true)
    }, 500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [handle])

  return (
    <div data-testid="news-x">
      <div ref={rootRef}>
        <a
          className="twitter-timeline"
          data-theme="dark"
          data-chrome="noheader nofooter noborders transparent"
          data-height="520"
          data-dnt="true"
          href={`https://twitter.com/${handle}`}
        >
          โพสต์จาก @{handle}
        </a>
      </div>
      {failed ? (
        <div data-testid="news-x-fallback" className="rounded-2xl border border-gold/40 bg-ink/70 p-4">
          <p className="text-sm text-cream">ไทม์ไลน์ X ยังไม่ขึ้นสำหรับผู้ที่ไม่ได้ล็อกอิน หรือเบราว์เซอร์บล็อกวิดเจ็ต</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex rounded-full bg-gold px-3 py-1.5 text-sm font-medium text-ink"
          >
            เปิดดูบน X
          </a>
        </div>
      ) : null}
    </div>
  )
}

function PostList({ posts }: { posts: NewsPost[] }) {
  return (
    <ul data-testid="news-x-posts" className="space-y-2">
      {posts.map((post) => (
        <li key={post.id} className="rounded-2xl border border-gold/30 bg-ink/60 p-3 text-sm">
          <p className="whitespace-pre-wrap text-cream">{post.text}</p>
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-gold">
            ดูบน X
          </a>
        </li>
      ))}
    </ul>
  )
}

function loadFacebook() {
  const src = 'https://connect.facebook.net/th_TH/sdk.js#xfbml=1&version=v21.0'
  return loadScript(src).then(() => {
    const fb = (window as Window & { FB?: { init?: (opts: object) => void; XFBML?: { parse: (node: HTMLElement) => void } } }).FB
    if (fb && !document.getElementById('fb-root')) {
      const root = document.createElement('div')
      root.id = 'fb-root'
      document.body.appendChild(root)
    }
  })
}

function loadTwitter() {
  return loadScript('https://platform.twitter.com/widgets.js')
}

const loading = new Map<string, Promise<void>>()

function loadScript(src: string) {
  const existing = loading.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve) => {
    const found = document.querySelector(`script[src="${src}"]`)
    if (found) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve()
    script.onerror = () => resolve()
    document.body.appendChild(script)
  })
  loading.set(src, promise)
  return promise
}
