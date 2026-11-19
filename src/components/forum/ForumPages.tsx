import { BoardIndex } from '@/components/forum/BoardIndex.tsx'
import { BoardView } from '@/components/forum/BoardView.tsx'
import { HelpPage, LoginNote, SearchPage } from '@/components/forum/ExtraPages.tsx'
import { TopicView } from '@/components/forum/TopicView.tsx'
import type { AppRoute } from '@/lib/route.ts'

export function ForumPages({ route }: { route: AppRoute }) {
  if (route.name === 'board') return <BoardView id={route.id} page={route.page} />
  if (route.name === 'topic') return <TopicView id={route.id} page={route.page} />
  if (route.name === 'search') return <SearchPage query={route.query} />
  if (route.name === 'help') return <HelpPage />
  if (route.name === 'login') return <LoginNote />
  return <BoardIndex />
}
