import { useEffect, useState, type ReactNode } from 'react'
import { BrandingProvider } from '@/components/forum/branding.tsx'
import { ForumLink, MemberName } from '@/components/forum/parts.tsx'
import { PromotionNotice } from '@/components/forum/Ranks.tsx'
import { AdSlots, VisitCounter } from '@/components/forum/SiteExtras.tsx'
import { PriceWatchlist } from '@/components/PriceWatchlist.tsx'
import {
  DEFAULT_BRANDING,
  forumGet,
  forumSend,
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

export function ForumShell({ route, children }: { route: AppRoute; children: ReactNode }) {
  const [me, setMe] = useState<ForumMe | null>(null)
  const [branding, setBranding] = useState<ForumBranding>(DEFAULT_BRANDING)
  const [stats, setStats] = useState<ForumStats | null>(null)
  const [online, setOnline] = useState<ForumOnline | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const routeKey = `${route.name}:${'id' in route ? route.id : ''}`

  useEffect(() => {
    let stopped = false
    const load = () => {
      void forumGet<{ me: ForumMe; stats: ForumStats; branding: ForumBranding; online: ForumOnline }>('/api/forum/bootstrap')
        .then((payload) => {
          if (stopped) return
          setMe(payload.me)
          setStats(payload.stats)
          if (payload.online) setOnline(payload.online)
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
  }, [routeKey])

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    clearSession()
    window.dispatchEvent(new Event('khuiwong-auth'))
    if (route.name === 'profile' || route.name === 'admin') go('/')
  }

  const homeCurrent = route.name === 'index' || route.name === 'board' || route.name === 'topic'

  return (
    <BrandingProvider value={branding}>
      <div className="smf-root smf-doc" data-testid={route.name === 'index' ? 'lobby' : 'forum-shell'}>
        <header className="smf-header">
          <div className="smf-hello">
            <p className="smf-logo" data-testid="forum-logo">{branding.siteName}</p>
            <div className="smf-userstrip">
              <p data-testid="forum-hello">
                {me?.accountId ? (
                  <>
                    Hello <span style={{ color: inkColor(me.color) }}>{me.name}</span>.
                  </>
                ) : (
                  <>
                    Hello Guest. Please <ForumLink to="/login">login</ForumLink> or <ForumLink to="/register">register</ForumLink>.
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
            {me?.accountId ? (
              <>
                <ForumLink to="/profile" current={route.name === 'profile'} testId="nav-profile">
                  PROFILE
                </ForumLink>
                {me.canModerate ? (
                  <ForumLink to="/admin" current={route.name === 'admin'} testId="nav-admin">
                    ADMIN
                  </ForumLink>
                ) : null}
                <button type="button" data-testid="nav-logout" onClick={() => void logout()}>
                  LOGOUT
                </button>
              </>
            ) : (
              <>
                <ForumLink to="/login" current={route.name === 'login'} testId="nav-login">
                  LOGIN
                </ForumLink>
                <ForumLink to="/register" testId="nav-register">
                  REGISTER
                </ForumLink>
              </>
            )}
          </nav>
        </header>
        <VisitCounter route={route} online={online?.total ?? null} />
        {me?.promotion ? (
          <PromotionNotice
            promotion={me.promotion}
            onDone={() => {
              void forumSend<{ me: ForumMe }>('/api/forum/promotion/ack', 'POST').then((payload) => {
                setMe(payload.me)
              })
            }}
          />
        ) : null}

        <div className="smf-layout">{children}</div>

        <footer className="smf-footer" data-testid="forum-footer">
            <p data-testid="forum-stats">
              {stats ? `${stats.posts} Posts in ${stats.topics} Topics by ${stats.members} Members.` : '…'} Latest Member:{' '}
              <span data-testid="latest-member">{stats?.latestMember ? <MemberName name={stats.latestMember.name} color={stats.latestMember.color} /> : '—'}</span>
            </p>
            <p data-testid="forum-online">
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
            <p>
              <ForumLink to="/ranks" testId="nav-ranks">
                ยศทั้งหมด
              </ForumLink>
            </p>
        </footer>
        <AdSlots />
        <PriceWatchlist />
      </div>
    </BrandingProvider>
  )
}
