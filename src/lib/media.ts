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

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop())
}
