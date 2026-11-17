import { cn } from '@/lib/utils.ts'

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-paper', className)}>
      <img
        src="/brand/fibo99-avatar.webp"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-full object-cover shadow-[0_0_0_1px_#1a120b,0_0_0_2px_#d4b36a]"
      />
      <span className="min-w-0 leading-none">
        <span className={cn('font-display block font-bold tracking-tight', compact ? 'hidden text-sm min-[480px]:block' : 'text-[1.35rem] sm:text-[1.55rem]')}>
          คุยวง
        </span>
        <span className="mt-0.5 block text-[10px] tracking-[0.14em] text-gold">{compact ? 'FIBO99' : 'by FIBO99'}</span>
      </span>
    </span>
  )
}
