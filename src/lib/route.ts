export type AppRoute =
  | { name: 'index' }
  | { name: 'board'; id: number; page: number }
  | { name: 'topic'; id: number; page: number }
  | { name: 'login' }
  | { name: 'profile' }
  | { name: 'admin' }
  | { name: 'ads' }
  | { name: 'help' }
  | { name: 'ranks' }
  | { name: 'search'; query: string }
  | { name: 'room'; code: string }

export function parseRoute(pathname: string, search = ''): AppRoute {
  const room = pathname.match(/^\/room\/([A-Za-z0-9]{4,8})\/?$/)
  if (room?.[1]) return { name: 'room', code: room[1].toUpperCase() }
  const board = pathname.match(/^\/board\/(\d+)\/?$/)
  if (board?.[1]) return { name: 'board', id: Number(board[1]), page: pageOf(search) }
  const topic = pathname.match(/^\/topic\/(\d+)\/?$/)
  if (topic?.[1]) return { name: 'topic', id: Number(topic[1]), page: pageOf(search) }
  if (/^\/(?:login|register)\/?$/.test(pathname)) return { name: 'login' }
  if (/^\/profile\/?$/.test(pathname)) return { name: 'profile' }
  if (/^\/admin\/ads\/?$/.test(pathname)) return { name: 'ads' }
  if (/^\/admin\/?$/.test(pathname)) return { name: 'admin' }
  if (/^\/help\/?$/.test(pathname)) return { name: 'help' }
  if (/^\/ranks\/?$/.test(pathname)) return { name: 'ranks' }
  if (/^\/search\/?$/.test(pathname)) {
    return { name: 'search', query: new URLSearchParams(search).get('q') ?? '' }
  }
  return { name: 'index' }
}

export function go(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function roomLink(code: string) {
  return `${window.location.origin}/room/${code}`
}

function pageOf(search: string) {
  const page = Number(new URLSearchParams(search).get('page'))
  if (!Number.isInteger(page) || page < 1 || page > 5000) return 1
  return page
}
