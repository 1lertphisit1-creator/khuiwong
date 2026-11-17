import { cn } from '@/lib/utils.ts'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-paper', className)}>
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="#e6a15c" />
        <circle cx="10" cy="16" r="2.3" fill="#1a120b" />
        <circle cx="16" cy="11.2" r="2.3" fill="#1a120b" />
        <circle cx="22" cy="16" r="2.3" fill="#1a120b" />
        <path
          d="M10.2 19.4c1.5 1.9 3.2 2.8 5.8 2.8s4.3-.9 5.8-2.8"
          fill="none"
          stroke="#1a120b"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="font-display text-[1.65rem] leading-none font-bold tracking-tight">คุยวง</span>
    </span>
  )
}
