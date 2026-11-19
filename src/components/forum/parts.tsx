import type { ReactNode } from 'react'
import { useBranding } from '@/components/forum/branding.tsx'
import { renderBbcode } from '@/lib/bbcode.ts'
import { go } from '@/lib/route.ts'
import type { RankId } from '@/types.ts'

const STARS: Record<RankId, number> = {
  owner: 5,
  admin: 5,
  moderator: 4,
  vip: 3,
  member: 1,
  guest: 0,
}

export function ForumLink({
  to,
  className,
  children,
  testId,
  current,
}: {
  to: string
  className?: string
  children: ReactNode
  testId?: string
  current?: boolean
}) {
  return (
    <a
      href={to}
      className={className}
      data-testid={testId}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        go(to)
      }}
    >
      {children}
    </a>
  )
}

export function Crumb({ items }: { items: { label: string; href?: string }[] }) {
  const { forumName } = useBranding()
  return (
    <p data-testid="forum-crumb" className="smf-crumb">
      <ForumLink to="/">{forumName}</ForumLink>
      {items.map((item) => (
        <span key={`${item.href ?? ''}-${item.label}`}>
          {' » '}
          {item.href ? <ForumLink to={item.href}>{item.label}</ForumLink> : item.label}
        </span>
      ))}
    </p>
  )
}

export function Pages({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return <p className="smf-pages">Pages: <strong>[1]</strong></p>
  const items = pageWindow(page, pages)
  return (
    <p data-testid="forum-pages" className="smf-pages">
      <span>Pages: </span>
      {items.map((item, index) => {
        if (item === '…') return <span key={`gap-${index}`}> … </span>
        if (item === page) return <strong key={item}> [{item}] </strong>
        return (
          <span key={item}>
            {' '}
            <ForumLink to={href(item)}>{item}</ForumLink>{' '}
          </span>
        )
      })}
    </p>
  )
}

export function Stars({ rank }: { rank: RankId }) {
  const count = STARS[rank] ?? 0
  if (!count) return null
  return (
    <span className="smf-stars" title={`${count} stars`}>
      {'★'.repeat(count)}
    </span>
  )
}

export function BbcodeBody({ text, className }: { text: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderBbcode(text) }} />
}

function pageWindow(page: number, pages: number) {
  const items: (number | '…')[] = []
  const push = (value: number | '…') => {
    if (items[items.length - 1] !== value) items.push(value)
  }
  for (let number = 1; number <= pages; number += 1) {
    if (number === 1 || number === pages || Math.abs(number - page) <= 2) push(number)
    else if (items[items.length - 1] !== '…') push('…')
  }
  return items
}
