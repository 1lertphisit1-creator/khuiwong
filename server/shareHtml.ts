import type { PageShare } from './forum.ts'

const SHARE_IMAGE_PATH = '/brand/share.png'
const SHARE_WIDTH = 1200
const SHARE_HEIGHT = 630

export function injectShareMeta(template: string, page: PageShare, canonical: string) {
  const image = page.imageUrl || new URL(SHARE_IMAGE_PATH, canonical).href
  const sized = !page.imageUrl
  const tags = [
    `<title>${escapeHtml(page.documentTitle)}</title>`,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="${page.type === 'article' ? 'article' : 'website'}" />`,
    `<meta property="og:locale" content="th_TH" />`,
    `<meta property="og:site_name" content="${escapeHtml(page.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    sized ? `<meta property="og:image:width" content="${SHARE_WIDTH}" />` : '',
    sized ? `<meta property="og:image:height" content="${SHARE_HEIGHT}" />` : '',
    `<meta property="og:image:alt" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ]
    .filter(Boolean)
    .join('\n    ')
  const stripped = template
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
  return stripped.replace(/<\/head>/i, `    ${tags}\n  </head>`)
}

export function isSharePath(pathname: string) {
  return pathname === '/' || /^\/topic\/\d+\/?$/.test(pathname) || /^\/board\/\d+\/?$/.test(pathname)
}

export function canonicalUrl(origin: string, pathname: string) {
  const path = pathname !== '/' && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname || '/'
  return new URL(path, origin).href
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
