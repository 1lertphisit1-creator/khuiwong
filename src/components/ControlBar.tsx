import { Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'

export function ControlBar({
  audioOn,
  videoOn,
  hasAudio,
  hasVideo,
  micAllowed,
  camAllowed,
  disabled,
  onToggleAudio,
  onToggleVideo,
  onRetry,
}: {
  audioOn: boolean
  videoOn: boolean
  hasAudio: boolean
  hasVideo: boolean
  micAllowed: boolean
  camAllowed: boolean
  disabled: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onRetry: () => void
}) {
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

  return (
    <div className="flex items-end justify-center gap-6 border-t border-border bg-card/50 px-3 py-3">
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
    </div>
  )
}
