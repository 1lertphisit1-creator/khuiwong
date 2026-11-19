import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthCard } from '@/components/AuthCard.tsx'
import { EtfFlowCard } from '@/components/EtfFlowCard.tsx'
import { FollowLinks } from '@/components/FollowLinks.tsx'
import { NewsPanel } from '@/components/NewsPanel.tsx'
import { BrandingProvider } from '@/components/forum/branding.tsx'
import { ForumLink } from '@/components/forum/parts.tsx'
import { PriceWatchlist } from '@/components/PriceWatchlist.tsx'
import {
  DEFAULT_BRANDING,
  forumGet,
  inkColor,
  onForum,
  publishForum,
  smfDate,
  type ForumBranding,
  type ForumMe,
  type ForumOnline,
  type ForumStats,
} from '@/lib/forum.ts'
import { go, type AppRoute } from '@/lib/route.ts'
import { api, clearSession } from '@/lib/session.ts'
import { cn } from '@/lib/utils.ts'

type Pane = 'forum' | 'live' | 'price' | 'etf' | 'news' | 'login'

export function ForumShell({ route, children }: { route: AppRoute; children: ReactNode }) {
  const live = route.name === 'live'
  const [pane, setPane] = useState<Pane>(live ? 'live' : route.name === 'login' ? 'login' : 'forum')
  const routeStamp = `${route.name}:${'id' in route ? route.id : ''}:${'page' in route ? route.page : ''}:${'query' in route ? route.query : ''}`
  const [seenRoute, setSeenRoute] = useState(routeStamp)
  const [me, setMe] = useState<ForumMe | null>(null)
  const [branding, setBranding] = useState<ForumBranding>(DEFAULT_BRANDING)
  const [stats, setStats] = useState<ForumStats | null>(null)
  const [online, setOnline] = useState<ForumOnline | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const hold = useRef(false)
  if (seenRoute !== routeStamp) {
    setSeenRoute(routeStamp)
    if (hold.current) hold.current = false
    else if (route.name === 'login') setPane('login')
    else if (route.name === 'live') setPane('live')
    else setPane('forum')
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let stopped = false
    const load = () => {
      void forumGet<{ me: ForumMe; stats: ForumStats; branding: ForumBranding }>('/api/forum/bootstrap')
        .then((payload) => {
          if (stopped) return
          setMe(payload.me)
          setStats(payload.stats)
          if (payload.branding?.siteName && payload.branding.forumName) setBranding(payload.branding)
        })
        .catch(() => {})
    }
    load()
    const stop = onForum((event) => {
      if (event.type === 'online') setOnline(event.online)
      else load()
    })
    const onAuth = () => {
      load()
      publishForum({ type: 'boards' })
    }
    window.addEventListener('khuiwong-auth', onAuth)
    return () => {
      stopped = true
      stop()
      window.removeEventListener('khuiwong-auth', onAuth)
    }
  }, [])

  function openWidget(next: 'price' | 'etf' | 'news') {
    setPane(next)
    if (route.name === 'live' || route.name === 'login') {
      hold.current = true
      go('/')
    }
    window.requestAnimationFrame(() => {
      document.getElementById(`widget-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    clearSession()
    window.dispatchEvent(new Event('khuiwong-auth'))
  }

  const homeCurrent = route.name === 'index' || route.name === 'board' || route.name === 'topic'

  return (
    <BrandingProvider value={branding}>
    <div className={cn('smf-root', live ? 'smf-live' : 'smf-doc')} data-testid={route.name === 'index' ? 'lobby' : 'forum-shell'}>
      <header className="smf-header">
        <div className="smf-hello">
          <div>
            <p className="smf-logo" data-testid="forum-logo">{branding.siteName}</p>
            <p className="smf-small">คุยวง by FIBO99</p>
          </div>
          <div className="smf-userstrip">
            <p data-testid="forum-hello">
              {me?.accountId ? (
                <>
                  Hello <span style={{ color: inkColor(me.color) }}>{me.name}</span>.
                </>
              ) : (
                <>
                  Hello Guest. Please <ForumLink to="/login">login</ForumLink> or <ForumLink to="/login">register</ForumLink>.
                </>
              )}
            </p>
            <p data-testid="forum-date">{smfDate(now)}</p>
          </div>
        </div>
        <nav className="smf-menu" aria-label="Forum">
          <ForumLink to="/" current={homeCurrent} testId="nav-forum">
            HOME
          </ForumLink>
          <ForumLink to="/live" current={route.name === 'live'} testId="nav-live">
            LIVE ROOM
          </ForumLink>
          <button type="button" data-testid="nav-price" onClick={() => openWidget('price')}>
            ราคา
          </button>
          <button type="button" data-testid="nav-etf" onClick={() => openWidget('etf')}>
            ETF
          </button>
          <button type="button" data-testid="nav-news" onClick={() => openWidget('news')}>
            ข่าว
          </button>
          <ForumLink to="/help" current={route.name === 'help'} testId="nav-help">
            HELP
          </ForumLink>
          <ForumLink to="/search" current={route.name === 'search'} testId="nav-search">
            SEARCH
          </ForumLink>
          {me?.accountId ? (
            <button type="button" data-testid="nav-logout" onClick={() => void logout()}>
              LOGOUT
            </button>
          ) : (
            <>
              <ForumLink to="/login" current={route.name === 'login'} testId="nav-login">
                LOGIN
              </ForumLink>
              <ForumLink to="/login" testId="nav-register">
                REGISTER
              </ForumLink>
            </>
          )}
        </nav>
      </header>

      {live ? (
        <div className="smf-live-body">{children}</div>
      ) : (
        <div className="smf-layout">
          <aside className={cn('smf-left', pane === 'forum' || pane === 'price' || pane === 'etf' || pane === 'login' ? 'flex' : 'hidden', 'lg:flex')}>
            <div className={cn(pane === 'forum' || pane === 'login' ? 'block' : 'hidden', 'lg:block')}>
              <SideBlock id="widget-brand" title="FIBO99">
                <BrandCard />
              </SideBlock>
            </div>
            <div className={cn(pane === 'login' ? 'block' : 'hidden', 'lg:block')}>
              <SideBlock id="widget-login" title="Login">
                <AuthCard signature={me?.signature ?? ''} onSession={() => window.dispatchEvent(new Event('khuiwong-auth'))} />
              </SideBlock>
            </div>
            <div className={cn(pane === 'price' ? 'block' : 'hidden', 'lg:block')}>
              <SideBlock id="widget-price" title="ราคา">
                <PriceWatchlist forum />
              </SideBlock>
            </div>
            <div className={cn(pane === 'etf' ? 'block' : 'hidden', 'lg:block')}>
              <SideBlock id="widget-etf" title="ETF Flow">
                <EtfFlowCard forum />
              </SideBlock>
            </div>
          </aside>
          <main className={cn('smf-main', pane === 'forum' ? 'block' : 'hidden', 'lg:block')} data-testid="forum-main">
            {children}
          </main>
          <aside className={cn('smf-right', pane === 'news' ? 'block' : 'hidden', 'lg:block')}>
            <SideBlock id="widget-news" title="ข่าว">
              <NewsPanel embedded forum />
            </SideBlock>
          </aside>
        </div>
      )}

      <FollowLinks tone="forum" />
      {live ? null : (
        <footer className="smf-footer" data-testid="forum-footer">
          <p>
            {stats ? `${stats.posts} Posts in ${stats.topics} Topics by ${stats.members} Members.` : '…'} Latest Member:{' '}
            {stats?.latestMember ?? '—'}
          </p>
          <p>
            Users Online:{' '}
            {online ? `${online.total} (${online.guests} Guests, ${online.members} Members)` : '…'}
            {online && online.users.length > 0 ? ': ' : ''}
            {online?.users.map((user) => (
              <span key={user.name} className="smf-online-name" style={{ color: inkColor(user.color) }}>
                {user.name}
              </span>
            ))}
          </p>
          <p className="smf-footer-brand" data-testid="forum-brand">{branding.forumName}</p>
        </footer>
      )}

      <nav className="smf-tabbar lg:hidden" aria-label="Mobile">
        <button type="button" aria-current={pane === 'forum' && !live ? 'page' : undefined} onClick={() => { setPane('forum'); if (route.name !== 'index') go('/') }}>
          Forum
        </button>
        <button type="button" data-testid="tab-live" aria-current={live ? 'page' : undefined} onClick={() => { if (route.name !== 'live') go('/live') }}>
          Live
        </button>
        <button type="button" aria-current={pane === 'price' ? 'page' : undefined} onClick={() => openWidget('price')}>
          ราคา
        </button>
        <button type="button" aria-current={pane === 'etf' ? 'page' : undefined} onClick={() => openWidget('etf')}>
          ETF
        </button>
        <button type="button" aria-current={pane === 'news' ? 'page' : undefined} onClick={() => openWidget('news')}>
          ข่าว
        </button>
        <button type="button" aria-current={pane === 'login' ? 'page' : undefined} onClick={() => { setPane('login'); if (route.name !== 'login') go('/login') }}>
          {me?.accountId ? 'บัญชี' : 'Login'}
        </button>
      </nav>
    </div>
    </BrandingProvider>
  )
}

function SideBlock({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section id={id} className="smf-widget">
      <button type="button" className="smf-cat smf-cat-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {title}
      </button>
      {open ? <div className="smf-widget-body">{children}</div> : null}
    </section>
  )
}

function BrandCard() {
  return (
    <figure className="smf-brand">
      <img src="/brand/fibo99-hero.webp" alt="FIBO99" width={960} height={960} />
      <figcaption>
        <img src="/brand/fibo99-avatar.webp" alt="" width={40} height={40} />
        <div>
          <h1>FIBO99</h1>
          <p>คุยวง</p>
        </div>
      </figcaption>
    </figure>
  )
}
