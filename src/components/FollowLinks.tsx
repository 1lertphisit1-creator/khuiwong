const LINKS = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/bitcoin.chiangrai',
    label: 'กดติดตาม FIBO99 บน Facebook',
    icon: FacebookIcon,
  },
  {
    name: 'X',
    href: 'https://x.com/Coach_Signal',
    label: 'กดติดตาม @Coach_Signal บน X',
    hint: '@Coach_Signal',
    icon: XIcon,
  },
  {
    name: 'YouTube',
    href: 'https://www.youtube.com/@fibo99',
    label: 'กดติดตาม FIBO99 บน YouTube',
    icon: YouTubeIcon,
  },
] as const

export function FollowLinks({ className = '', tone = 'dark' }: { className?: string; tone?: 'dark' | 'forum' }) {
  const forum = tone === 'forum'
  return (
    <section data-testid="follow-fibo" className={forum ? `border-t border-[#696969] bg-[#f4f4f6] px-3 py-2 text-black ${className}` : `border-t border-gold/30 bg-ink/50 px-3 py-3 ${className}`}>
      <p className={forum ? 'text-center text-xs font-bold text-[#334466]' : 'font-display text-center text-sm font-bold tracking-wide text-gold'}>กดติดตาม FIBO99</p>
      <ul className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {LINKS.map((link) => (
          <li key={link.name}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              className={forum ? 'inline-flex min-h-11 items-center gap-2 border border-[#6b8abf] bg-white px-3 py-1.5 text-xs font-bold text-[#334466]' : 'inline-flex items-center gap-2 rounded-full border border-gold/40 bg-burgundy/50 px-3 py-1.5 text-xs text-cream transition hover:border-gold hover:bg-burgundy'}
            >
              <link.icon />
              <span>{link.name}</span>
              {'hint' in link ? <span className={forum ? 'font-normal text-[#333]' : 'text-gold'}>{link.hint}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.5 8.5V6.8c0-.7.5-1 1.2-1H17V3h-2.1C12.4 3 11 4.5 11 6.6v1.9H9v2.7h2V21h3.5v-9.8h2.2l.3-2.7h-2.5z"
      />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path fill="currentColor" d="M14.7 10.4 21.4 3h-1.6l-5.8 6.4L9.2 3H3.4l7 10-7 7.7h1.6l6.1-6.8 4.9 6.8h5.8l-7.1-10.3zm-2.2 2.4-.7-1-5.6-7.6h2.4l4.5 6.2.7 1 5.9 8h-2.4l-4.8-6.6z" />
    </svg>
  )
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M23 12.2s0-3.2-.4-4.6c-.2-.9-.9-1.6-1.8-1.8C19.2 5.4 12 5.4 12 5.4s-7.2 0-8.8.4c-.9.2-1.6.9-1.8 1.8C1 9 1 12.2 1 12.2s0 3.2.4 4.6c.2.9.9 1.6 1.8 1.8 1.6.4 8.8.4 8.8.4s7.2 0 8.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.4.4-4.6.4-4.6zM9.8 15.5v-6.6l6.2 3.3-6.2 3.3z"
      />
    </svg>
  )
}
