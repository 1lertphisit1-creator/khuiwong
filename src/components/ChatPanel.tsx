import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { AvatarFace } from '@/components/AvatarFace.tsx'
import { RankBadge } from '@/components/RankBadge.tsx'
import { cn, formatTime } from '@/lib/utils.ts'
import { safeColor, type ChatMessage } from '@/types.ts'

export function ChatPanel({
  messages,
  selfId,
  disabled,
  blocked,
  onSend,
}: {
  messages: ChatMessage[]
  selfId: string | null
  disabled: boolean
  blocked?: boolean
  onSend: (text: string) => boolean
}) {
  const [text, setText] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-card/40">
      <header className="hidden items-center px-4 pt-4 pb-2 lg:flex">
        <h2 className="font-display text-lg font-bold">แชต</h2>
      </header>
      <div
        ref={scrollerRef}
        data-testid="chat-log"
        aria-live="polite"
        className="app-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีข้อความ ทักทายคนในห้องได้เลย
          </p>
        ) : (
          messages.map((message) => {
            if (message.kind === 'system') {
              return (
                <p
                  key={message.id}
                  data-testid="chat-message"
                  data-kind="system"
                  className="text-center text-xs leading-relaxed text-muted-foreground"
                >
                  <span>{message.text}</span>
                  <time className="ml-2 tabular-nums" dateTime={new Date(message.at).toISOString()}>
                    {formatTime(message.at)}
                  </time>
                </p>
              )
            }
            const own = message.from === selfId
            return (
              <article
                key={message.id}
                data-testid="chat-message"
                data-kind="chat"
                className={cn('flex max-w-full flex-col', own ? 'items-end' : 'items-start')}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <AvatarFace name={message.name} color={message.color} url={message.avatarUrl} className="h-6 w-6 text-[11px]" />
                  <span className="font-medium" style={{ color: safeColor(message.color) }}>
                    {own ? `${message.name} · คุณ` : message.name}
                  </span>
                  {message.rank && message.rankLabel ? <RankBadge rank={message.rank} label={message.rankLabel} /> : null}
                  <time className="tabular-nums" dateTime={new Date(message.at).toISOString()}>
                    {formatTime(message.at)}
                  </time>
                </div>
                <p
                  className={cn(
                    'max-w-[min(100%,20rem)] rounded-2xl px-3 py-2 text-sm leading-relaxed break-words',
                    own ? 'rounded-br-md bg-amber text-ink' : 'rounded-bl-md bg-secondary text-paper',
                  )}
                >
                  {message.text}
                </p>
              </article>
            )
          })
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (onSend(text)) setText('')
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          ข้อความ
        </label>
        <Input
          id="chat-input"
          value={text}
          maxLength={500}
          placeholder={blocked ? 'คุณถูกปิดแชต' : 'พิมพ์ข้อความ'}
          aria-label="ข้อความ"
          data-testid="message-input"
          disabled={disabled || blocked}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0"
          aria-label="ส่ง"
          data-testid="send"
          disabled={disabled || blocked || text.trim().length === 0}
        >
          <Send />
        </Button>
      </form>
    </section>
  )
}
