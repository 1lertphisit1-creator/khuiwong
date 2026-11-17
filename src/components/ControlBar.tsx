import { Mic, MicOff, MonitorUp, MonitorOff, Video, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'
import { screenShareBlockReason } from '@/lib/media.ts'

export function ControlBar({
  audioOn,
  videoOn,
  sharing,
  hasAudio,
  hasVideo,
  micAllowed,
  camAllowed,
  screenAllowed,
  disabled,
  screenNotice,
  onToggleAudio,
  onToggleVideo,
  onToggleScreen,
  onRetry,
}: {
  audioOn: boolean
  videoOn: boolean
  sharing: boolean
  hasAudio: boolean
  hasVideo: boolean
  micAllowed: boolean
  camAllowed: boolean
  screenAllowed: boolean
  disabled: boolean
  screenNotice: string | null
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleScreen: () => void
  onRetry: () => void
}) {
  const unsupported = screenShareBlockReason()
  const micLabel = !micAllowed
    ? 'ไมค์ถูกจำกัดโดยผู้ดูแล'
    : !hasAudio
      ? 'ลองเปิดไมโครโฟนอีกครั้ง'
      : audioOn
        ? 'ปิดไมโครโฟน'
        : 'เปิดไมโครโฟน'
  const camLabel = !camAllowed
    ? 'กล้องถูกจำกัดโดยผู้ดูแล'
    : !hasVideo
      ? 'ลองเปิดกล้องอีกครั้ง'
      : videoOn
        ? 'ปิดกล้อง'
        : 'เปิดกล้อง'
  const screenLabel = unsupported
    ? unsupported
    : !screenAllowed
      ? 'แชร์หน้าจอถูกจำกัดโดยผู้ดูแล'
      : sharing
        ? 'หยุดแชร์หน้าจอ'
        : 'แชร์หน้าจอ'
  const screenCaption = unsupported ? 'แชร์จอไม่ได้' : !screenAllowed ? 'แชร์จอถูกจำกัด' : sharing ? 'กำลังแชร์' : 'แชร์หน้าจอ'

  return (
    <div className="flex flex-col items-center gap-2 border-t border-border bg-card/50 px-3 py-3">
      <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={hasAudio && audioOn ? 'secondary' : 'destructive'}
            className="h-14 w-14 rounded-full"
            aria-pressed={hasAudio ? audioOn : undefined}
            aria-label={micLabel}
            data-testid="toggle-mic"
            disabled={disabled}
            onClick={() => {
              if (!micAllowed) return
              if (!hasAudio) onRetry()
              else onToggleAudio()
            }}
          >
            {hasAudio && audioOn ? <Mic /> : <MicOff />}
          </Button>
          <span className="text-xs text-muted-foreground">{!micAllowed ? 'ไมค์ถูกจำกัด' : hasAudio && audioOn ? 'ไมค์เปิด' : 'ไมค์ปิด'}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={hasVideo && videoOn ? 'secondary' : 'destructive'}
            className="h-14 w-14 rounded-full"
            aria-pressed={hasVideo ? videoOn : undefined}
            aria-label={camLabel}
            data-testid="toggle-cam"
            disabled={disabled}
            onClick={() => {
              if (!camAllowed) return
              if (!hasVideo) onRetry()
              else onToggleVideo()
            }}
          >
            {hasVideo && videoOn ? <Video /> : <VideoOff />}
          </Button>
          <span className="text-xs text-muted-foreground">{!camAllowed ? 'กล้องถูกจำกัด' : hasVideo && videoOn ? 'กล้องเปิด' : 'กล้องปิด'}</span>
        </div>
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
          <span className="text-xs text-muted-foreground">{screenCaption}</span>
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
