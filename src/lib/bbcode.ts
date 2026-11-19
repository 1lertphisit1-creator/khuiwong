const QUOTE = /\[quote(?:\s+author=(.*?))?(?:\s+date=(.*?))?\]([\s\S]*?)\[\/quote\]/i
const QUOTE_NAMED = /\[quote=([^\]]*)\]([\s\S]*?)\[\/quote\]/i

export function renderBbcode(input: string) {
  let text = escapeHtml(input)
  const codes: string[] = []
  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_match, body: string) => {
    codes.push(body)
    return `%%CODE${codes.length - 1}%%`
  })
  text = applyQuotes(text)
  text = applyInline(text)
  text = text.replace(/\n/g, '<br />')
  text = text.replace(/%%CODE(\d+)%%/g, (_match, index: string) => {
    const body = codes[Number(index)] ?? ''
    return `<div class="codeheader">Code:</div><pre class="code">${body}</pre>`
  })
  return text
}

function applyQuotes(text: string) {
  let current = text
  for (let guard = 0; guard < 12; guard += 1) {
    const next = current
      .replace(QUOTE_NAMED, (_match, author: string, body: string) => quoteHtml(author, '', body))
      .replace(QUOTE, (_match, author: string | undefined, date: string | undefined, body: string) =>
        quoteHtml(author ?? '', date ?? '', body),
      )
    if (next === current) break
    current = next
  }
  return current
}

function quoteHtml(author: string, date: string, body: string) {
  const who = author.trim()
  const when = date.trim()
  const header = who ? `Quote from: ${who}${when ? ` on ${when}` : ''}` : 'Quote'
  return `<div class="quoteheader">${header}</div><blockquote class="quote">${body}</blockquote>`
}

function applyInline(text: string) {
  let current = text
  for (let guard = 0; guard < 6; guard += 1) {
    const next = current
      .replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<b>$1</b>')
      .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<i>$1</i>')
      .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<span style="text-decoration:underline">$1</span>')
      .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_match, href: string, label: string) => linkHtml(href, label))
      .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_match, href: string) => linkHtml(href, href))
      .replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_match, href: string) => imageHtml(href))
    if (next === current) break
    current = next
  }
  return current
}

function linkHtml(href: string, label: string) {
  const safe = safeUrl(decodeHtml(href.trim()))
  if (!safe) return label
  return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${label}</a>`
}

function imageHtml(href: string) {
  const safe = safeUrl(decodeHtml(href.trim()))
  if (!safe) return ''
  return `<img class="smf-img" src="${escapeHtml(safe)}" alt="" />`
}

function safeUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
