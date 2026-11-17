export type AppRoute = { name: 'lobby' } | { name: 'room'; code: string }

export function parseRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/room\/([A-Za-z0-9]{4,8})\/?$/)
  if (match?.[1]) return { name: 'room', code: match[1].toUpperCase() }
  return { name: 'lobby' }
}

export function go(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function roomLink(code: string) {
  return `${window.location.origin}/room/${code}`
}
