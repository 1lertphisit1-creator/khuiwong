import { cn } from '@/lib/utils.ts'
import { safeColor } from '@/types.ts'

export function AvatarFace({
  name,
  color,
  url,
  speaking,
  className,
}: {
  name: string
  color?: string
  url?: string | null
  speaking?: boolean
  className?: string
}) {
  const letter = [...name][0] ?? '?'
  return (
    <span
      data-speaking={speaking ? 'true' : 'false'}
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink font-display text-cream',
        speaking && 'shadow-[0_0_0_3px_#e0c17a,0_0_16px_rgba(224,193,122,0.65)]',
        className,
      )}
      style={url ? undefined : { color: safeColor(color) }}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : letter}
    </span>
  )
}
