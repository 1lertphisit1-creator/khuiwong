import { lazy, Suspense } from 'react'
import { BoardIndex } from '@/components/forum/BoardIndex.tsx'
import { BoardView } from '@/components/forum/BoardView.tsx'
import { AccountPage, HelpPage, SearchPage } from '@/components/forum/ExtraPages.tsx'
import { AdAdminPage } from '@/components/forum/SiteExtras.tsx'
import { RanksPage } from '@/components/forum/Ranks.tsx'
import { TopicView } from '@/components/forum/TopicView.tsx'
import type { AppRoute } from '@/lib/route.ts'

const ForumAdminPage = lazy(() => import('@/components/forum/ForumAdmin.tsx').then((module) => ({ default: module.ForumAdminPage })))

export function ForumPages({ route }: { route: AppRoute }) {
  if (route.name === 'board') return <BoardView id={route.id} page={route.page} />
  if (route.name === 'topic') return <TopicView id={route.id} page={route.page} />
  if (route.name === 'search') return <SearchPage query={route.query} />
  if (route.name === 'help') return <HelpPage />
  if (route.name === 'ranks') return <RanksPage />
  if (route.name === 'ads') return <AdAdminPage />
  if (route.name === 'admin') {
    return (
      <Suspense fallback={<p className="smf-small">Loading…</p>}>
        <ForumAdminPage />
      </Suspense>
    )
  }
  if (route.name === 'profile') return <AccountPage mode="profile" />
  if (route.name === 'login') return <AccountPage mode="login" />
  return <BoardIndex />
}
