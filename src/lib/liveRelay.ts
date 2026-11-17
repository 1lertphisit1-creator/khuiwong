import type { Socket } from 'socket.io-client'

export type RelayChunk = {
  id: string
  gen: number
  seq: number
  mime: string
  chunk: ArrayBuffer
}

export function relayMime(kind: 'audio' | 'video') {
  const candidates =
    kind === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/webm']
      : ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']
  return candidates.find((item) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item)) ?? ''
}

export function publishChunks(
  socket: Socket,
  event: 'mic-chunk' | 'screen-chunk',
  stream: MediaStream,
  kind: 'audio' | 'video',
) {
  const mime = relayMime(kind)
  if (!mime) return () => {}
  const gen = Date.now()
  let seq = 0
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 32_000,
      videoBitsPerSecond: kind === 'video' ? 800_000 : 32_000,
    })
  } catch {
    return () => {}
  }
  recorder.ondataavailable = (ev) => {
    if (!ev.data.size || !socket.connected) return
    void ev.data.arrayBuffer().then((chunk) => {
      if (!socket.connected) return
      socket.emit(event, { gen, seq: seq++, mime, chunk })
    })
  }
  recorder.start(kind === 'audio' ? 120 : 200)
  return () => {
    if (recorder.state !== 'inactive') recorder.stop()
    if (socket.connected) socket.emit(kind === 'audio' ? 'mic-end' : 'screen-end', { gen })
  }
}

export function asArrayBuffer(chunk: unknown): ArrayBuffer | null {
  if (chunk instanceof ArrayBuffer) return chunk
  if (ArrayBuffer.isView(chunk)) {
    const copy = new ArrayBuffer(chunk.byteLength)
    new Uint8Array(copy).set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength))
    return copy
  }
  return null
}

export class LivePlayback {
  private mediaSource: MediaSource | null = null
  private buffer: SourceBuffer | null = null
  private queue: ArrayBuffer[] = []
  private gen = -1
  private mime = ''
  private url = ''
  private closed = false
  private media: HTMLMediaElement

  constructor(media: HTMLMediaElement) {
    this.media = media
  }

  push(gen: number, mime: string, chunk: ArrayBuffer) {
    if (this.closed || !chunk.byteLength) return
    if (gen !== this.gen) {
      this.gen = gen
      this.mime = mime
      this.queue = [chunk]
      this.open()
      return
    }
    this.queue.push(chunk)
    if (this.queue.length > 48) this.queue.splice(0, this.queue.length - 48)
    this.pump()
  }

  close() {
    this.closed = true
    this.queue = []
    this.buffer = null
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
    this.media.removeAttribute('src')
    this.media.load()
  }

  private open() {
    if (this.closed) return
    this.buffer = null
    if (this.url) URL.revokeObjectURL(this.url)
    const source = new MediaSource()
    this.mediaSource = source
    this.url = URL.createObjectURL(source)
    this.media.src = this.url
    source.addEventListener('sourceopen', () => {
      if (this.closed || this.mediaSource !== source || source.readyState !== 'open') return
      if (source.sourceBuffers.length > 0) return
      try {
        const buffer = source.addSourceBuffer(this.mime || 'audio/webm;codecs=opus')
        buffer.mode = 'sequence'
        this.buffer = buffer
        buffer.addEventListener('updateend', () => this.pump())
        this.pump()
      } catch {
        this.media.dataset.relayError = 'mime'
      }
    })
  }

  private pump() {
    const buffer = this.buffer
    if (!buffer || buffer.updating || this.queue.length === 0) return
    const next = this.queue.shift()
    if (!next) return
    try {
      buffer.appendBuffer(next)
      this.media.dataset.live = 'true'
      if (this.media.paused) void this.media.play().catch(() => {})
    } catch {
      this.queue = []
    }
  }
}
