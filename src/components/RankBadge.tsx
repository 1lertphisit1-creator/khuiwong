import type { RankId } from '@/types.ts'

const tone: Record<RankId, string> = {
  owner: 'border-amber/50 text-amber',
  admin: 'border-rose/50 text-rose',
  moderator: 'border-teal/50 text-teal',
  vip: 'border-[#c9a0dc]/60 text-[#c9a0dc]',
  member: 'border-white/20 text-paper/80',
  guest: 'border-white/10 text-muted-foreground',
}

export function RankBadge({ rank, label }: { rank: RankId; label: string }) {
  return (
    <span
      data-testid="rank-badge"
      data-rank={rank}
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${tone[rank]}`}
    >
      {label}
    </span>
  )
}
