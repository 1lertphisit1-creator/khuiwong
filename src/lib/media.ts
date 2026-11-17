export type MediaResult = {
  stream: MediaStream | null
  warning: string | null
}

const AUDIO = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

const VIDEO = {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 720 },
}

function errorName(error: unknown) {
  if (error instanceof DOMException) return error.name
  if (error instanceof Error) return error.name
  return ''
}

function deniedMessage() {
  return 'เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ไมโครโฟนหรือกล้อง แชตข้อความยังใช้ได้ตามปกติ'
}

function failureMessage(error: unknown) {
  const name = errorName(error)
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return deniedMessage()
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'ไม่พบไมโครโฟนหรือกล้อง แชตข้อความยังใช้ได้ตามปกติ'
  }
  if (name === 'NotReadableError') {
    return 'อุปกรณ์กำลังถูกใช้โดยโปรแกรมอื่น แชตข้อความยังใช้ได้ตามปกติ'
  }
  return 'เปิดไมโครโฟนและกล้องไม่สำเร็จ แชตข้อความยังใช้ได้ตามปกติ'
}

async function open(constraints: MediaStreamConstraints) {
  return navigator.mediaDevices.getUserMedia(constraints)
}

export async function acquireMedia(): Promise<MediaResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      warning:
        'เปิดไมโครโฟนและกล้องได้บน localhost หรือเว็บที่เป็น HTTPS เท่านั้น แชตข้อความยังใช้ได้ตามปกติ',
    }
  }

  try {
    const stream = await open({ audio: AUDIO, video: VIDEO })
    return { stream, warning: null }
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return { stream: null, warning: deniedMessage() }
    }
  }

  try {
    const stream = await open({ audio: AUDIO, video: false })
    return { stream, warning: 'เปิดกล้องไม่สำเร็จ ตอนนี้ใช้ได้เฉพาะไมโครโฟนและแชต' }
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return { stream: null, warning: deniedMessage() }
    }
  }

  try {
    const stream = await open({ audio: false, video: VIDEO })
    return { stream, warning: 'เปิดไมโครโฟนไม่สำเร็จ ตอนนี้ใช้ได้เฉพาะกล้องและแชต' }
  } catch (error) {
    return { stream: null, warning: failureMessage(error) }
  }
}

const SCREEN_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
}

export function screenShareBlockReason() {
  if (typeof navigator === 'undefined') return 'เบราว์เซอร์นี้ยังแชร์หน้าจอไม่ได้'
  const api = typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  const ua = navigator.userAgent || ''
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  const narrowTouch =
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 900px)').matches &&
    navigator.maxTouchPoints > 1
  if (mobile || narrowTouch) return 'มือถือยังแชร์หน้าจอไม่ได้ ใช้คอมพิวเตอร์แทน'
  if (!api) return 'เบราว์เซอร์นี้ยังแชร์หน้าจอไม่ได้ ใช้ Chrome, Edge, Firefox หรือ Safari บนคอมพิวเตอร์'
  return null
}

function tuneScreen(stream: MediaStream) {
  for (const track of stream.getVideoTracks()) {
    track.contentHint = 'detail'
    void track.applyConstraints(SCREEN_VIDEO).catch(() => {
      // The browser already picked the closest mode it can send.
    })
  }
}

export async function captureScreen(): Promise<MediaResult> {
  const blocked = screenShareBlockReason()
  if (blocked) return { stream: null, warning: blocked }
  const display = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
  try {
    const stream = await display({
      video: SCREEN_VIDEO,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    tuneScreen(stream)
    return { stream, warning: null }
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError') {
      return { stream: null, warning: null }
    }
  }

  try {
    const stream = await display({ video: SCREEN_VIDEO, audio: false })
    tuneScreen(stream)
    return { stream, warning: null }
  } catch (error) {
    const name = errorName(error)
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'AbortError') {
      return { stream: null, warning: null }
    }
    return { stream: null, warning: 'แชร์หน้าจอไม่สำเร็จ ลองอีกครั้ง' }
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function whenTrackEnds(track: MediaStreamTrack, onEnd: () => void) {
  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.clearInterval(timer)
    track.removeEventListener('ended', finish)
    onEnd()
  }
  track.addEventListener('ended', finish)
  const timer = window.setInterval(() => {
    if (track.readyState === 'ended') finish()
  }, 200)
  if (track.readyState === 'ended') finish()
}
