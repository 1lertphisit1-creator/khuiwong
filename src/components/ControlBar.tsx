import { Hand, Mic, MicOff, MonitorOff, MonitorUp } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { screenShareBlockReason } from '@/lib/media.ts'

export function ControlBar({
  audioOn,
  sharing,
  hasAudio,
  micAllowed,
  screenAllowed,
  speaker,
  handRaised,
  canTakeSlot,
  disabled,
  screenNotice,
  onToggleAudio,
  onRaiseHand,
  onTakeSlot,
  onToggleScreen,
  onRetry,
}: {
  audioOn: boolean
  sharing: boolean
  hasAudio: boolean
  micAllowed: boolean
  screenAllowed: boolean
  speaker: boolean
  handRaised: boolean
  canTakeSlot: boolean
  disabled: boolean
  screenNotice: string | null
  onToggleAudio: () => void
  onRaiseHand: (raised: boolean) => void
  onTakeSlot: () => void
  onToggleScreen: () => void
  onRetry: () => void
}) {
  const unsupported = screenShareBlockReason()
  const micLabel = !micAllowed
    ? 'ไมค์ถูกจำกัดโดยผู้ดูแล'
    : speaker
      ? !hasAudio
        ? 'ลองเปิดไมโครโฟนอีกครั้ง'
        : audioOn
          ? 'ปิดไมโครโฟน'
          : 'เปิดไมโครโฟน'
      : handRaised
        ? 'ยกเลิกขอพูด'
        : 'ขอพูด'
  const screenLabel = unsupported
    ? unsupported
    : !screenAllowed
      ? 'แชร์หน้าจอถูกจำกัดโดยผู้ดูแล'
      : sharing
        ? 'หยุดแชร์หน้าจอ'
        : 'แชร์หน้าจอ'

  return (
    <div className="flex flex-col items-center gap-2 border-t border-gold/30 bg-ink/80 px-3 py-3">
      <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={speaker && hasAudio && audioOn ? 'default' : handRaised ? 'secondary' : 'destructive'}
            className="h-14 w-14 rounded-full"
            aria-pressed={speaker ? audioOn : handRaised}
            aria-label={micLabel}
            data-testid="toggle-mic"
            disabled={disabled || !micAllowed}
            onClick={() => {
              if (!micAllowed) return
              if (speaker) {
                if (!hasAudio) onRetry()
                else onToggleAudio()
                return
              }
              onRaiseHand(!handRaised)
            }}
          >
            {speaker ? (hasAudio && audioOn ? <Mic /> : <MicOff />) : <Hand />}
          </Button>
          <span className="text-xs text-muted-foreground">
            {!micAllowed ? 'ไมค์ถูกจำกัด' : speaker ? (hasAudio && audioOn ? 'ไมค์เปิด' : 'ไมค์ปิด') : handRaised ? 'รอคิวพูด' : 'ขอพูด'}
          </span>
        </div>
        {canTakeSlot ? (
          <div className="flex flex-col items-center gap-1">
            <Button type="button" size="sm" variant="secondary" data-testid="take-slot" disabled={disabled} onClick={onTakeSlot}>
              ขึ้นพูด
            </Button>
            <span className="text-xs text-muted-foreground">ช่องไมค์ว่าง</span>
          </div>
        ) : null}
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={sharing ? 'default' : 'secondary'}
            className="h-14 w-14 rounded-full"
            aria-pressed={unsupported ? undefined : sharing}
            aria-label={screenLabel}
            title={screenLabel}
            data-testid="toggle-screen"
            disabled={disabled || Boolean(unsupported) || !screenAllowed}
            onClick={onToggleScreen}
          >
            {sharing ? <MonitorOff /> : <MonitorUp />}
          </Button>
          <span className="text-xs text-muted-foreground">
            {unsupported ? 'แชร์จอไม่ได้' : !screenAllowed ? 'แชร์จอถูกจำกัด' : sharing ? 'กำลังแชร์' : 'แชร์หน้าจอ'}
          </span>
        </div>
      </div>
      {unsupported ? (
        <p data-testid="screen-unsupported" className="max-w-md text-center text-xs leading-relaxed text-muted-foreground">
          {unsupported}
        </p>
      ) : null}
      {screenNotice ? (
        <p data-testid="screen-notice" className="max-w-md text-center text-xs text-rose">
          {screenNotice}
        </p>
      ) : null}
    </div>
  )
}
