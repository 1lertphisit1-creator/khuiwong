import type { Socket } from 'socket.io-client'
import type { SignalData } from '../types.ts'

type Peer = {
  pc: RTCPeerConnection
  pending: RTCIceCandidateInit[]
  makingOffer: boolean
  renegotiate: boolean
  ignoreOffer: boolean
}

const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
]

export class Mesh {
  private peers = new Map<string, Peer>()
  private closed = false
  private readonly socket: Socket
  private readonly selfId: string
  private readonly iceServers: RTCIceServer[]
  private readonly getLocalStream: () => MediaStream | null
  private readonly onStream: (id: string, stream: MediaStream | null) => void

  constructor(
    socket: Socket,
    selfId: string,
    iceServers: RTCIceServer[],
    getLocalStream: () => MediaStream | null,
    onStream: (id: string, stream: MediaStream | null) => void,
  ) {
    this.socket = socket
    this.selfId = selfId
    this.iceServers = iceServers
    this.getLocalStream = getLocalStream
    this.onStream = onStream
  }

  static fallbackIce() {
    return DEFAULT_ICE
  }

  close() {
    this.closed = true
    for (const id of [...this.peers.keys()]) this.drop(id)
  }

  drop(id: string) {
    const peer = this.peers.get(id)
    if (!peer) return
    peer.pc.onicecandidate = null
    peer.pc.ontrack = null
    peer.pc.onconnectionstatechange = null
    peer.pc.onsignalingstatechange = null
    peer.pc.close()
    this.peers.delete(id)
    this.onStream(id, null)
  }

  async connectTo(id: string) {
    if (this.closed || id === this.selfId) return
    this.ensure(id)
    await this.offer(id)
  }

  async republish() {
    if (this.closed) return
    const stream = this.getLocalStream()
    for (const id of [...this.peers.keys()]) {
      const peer = this.peers.get(id)
      if (!peer) continue
      if (stream) await this.attachTracks(peer, stream)
      await this.offer(id)
    }
  }

  async handleSignal(from: string, data: SignalData) {
    if (this.closed || from === this.selfId) return
    const peer = this.ensure(from)
    const pc = peer.pc

    if (data.description) {
      const description = data.description
      if (!description.type) return
      const offerCollision =
        description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
      const polite = this.selfId > from
      if (offerCollision && !polite) {
        peer.ignoreOffer = true
        return
      }
      peer.ignoreOffer = false
      if (offerCollision) {
        try {
          await pc.setLocalDescription({ type: 'rollback' })
        } catch {
          this.drop(from)
          await this.acceptOffer(from, description)
          return
        }
      }
      await this.applyDescription(from, this.ensure(from), description)
      return
    }

    if (data.candidate) {
      if (peer.ignoreOffer) return
      if (!pc.remoteDescription) {
        peer.pending.push(data.candidate)
        return
      }
      try {
        await pc.addIceCandidate(data.candidate)
      } catch {
        // Candidates for a rolled-back description can be ignored.
      }
    }
  }

  private async acceptOffer(from: string, description: RTCSessionDescriptionInit) {
    const peer = this.ensure(from)
    await this.applyDescription(from, peer, description)
  }

  private async applyDescription(from: string, peer: Peer, description: RTCSessionDescriptionInit) {
    await peer.pc.setRemoteDescription(description)
    await this.flush(peer)
    if (description.type === 'offer') {
      await peer.pc.setLocalDescription(await peer.pc.createAnswer())
      this.sendDescription(from, peer.pc.localDescription)
    }
  }

  private ensure(id: string) {
    const existing = this.peers.get(id)
    if (existing) return existing
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers.length > 0 ? this.iceServers : DEFAULT_ICE,
    })
    const peer: Peer = {
      pc,
      pending: [],
      makingOffer: false,
      renegotiate: false,
      ignoreOffer: false,
    }
    this.peers.set(id, peer)
    const stream = this.getLocalStream()
    this.bindLocalMedia(pc, stream)

    pc.onicecandidate = (event) => {
      if (!event.candidate || this.closed) return
      this.socket.emit('signal', {
        to: id,
        data: { candidate: event.candidate.toJSON() },
      })
    }

    pc.ontrack = (event) => {
      const [remote] = event.streams
      if (remote) this.onStream(id, remote)
    }

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable' && peer.renegotiate && !this.closed) {
        peer.renegotiate = false
        void this.offer(id)
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && !this.closed) void this.restart(id)
    }

    return peer
  }

  private bindLocalMedia(pc: RTCPeerConnection, stream: MediaStream | null) {
    const audio = stream?.getAudioTracks()[0]
    const video = stream?.getVideoTracks()[0]
    if (audio && stream) pc.addTrack(audio, stream)
    else pc.addTransceiver('audio', { direction: 'recvonly' })
    if (video && stream) pc.addTrack(video, stream)
    else pc.addTransceiver('video', { direction: 'recvonly' })
  }

  private async attachTracks(peer: Peer, stream: MediaStream) {
    for (const kind of ['audio', 'video'] as const) {
      const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
      if (!track) continue
      const transceiver = peer.pc.getTransceivers().find((item) => item.receiver.track.kind === kind)
      if (!transceiver) {
        peer.pc.addTrack(track, stream)
        continue
      }
      await transceiver.sender.replaceTrack(track)
      if (transceiver.direction === 'recvonly' || transceiver.direction === 'inactive') {
        transceiver.direction = 'sendrecv'
      }
    }
  }

  private async offer(id: string) {
    const peer = this.peers.get(id)
    if (!peer || this.closed) return
    if (peer.pc.signalingState !== 'stable') {
      peer.renegotiate = true
      return
    }
    peer.makingOffer = true
    try {
      const offer = await peer.pc.createOffer()
      if (this.closed || peer.pc.signalingState !== 'stable') return
      await peer.pc.setLocalDescription(offer)
      this.sendDescription(id, peer.pc.localDescription)
    } catch (error) {
      console.warn('ส่งข้อเสนอการเชื่อมต่อไม่สำเร็จ', error)
    } finally {
      peer.makingOffer = false
    }
  }

  private async restart(id: string) {
    const peer = this.peers.get(id)
    if (!peer || this.closed || peer.pc.signalingState !== 'stable') return
    peer.makingOffer = true
    try {
      const offer = await peer.pc.createOffer({ iceRestart: true })
      if (this.closed) return
      await peer.pc.setLocalDescription(offer)
      this.sendDescription(id, peer.pc.localDescription)
    } catch (error) {
      console.warn('เริ่ม ICE ใหม่ไม่สำเร็จ', error)
    } finally {
      peer.makingOffer = false
    }
  }

  private async flush(peer: Peer) {
    const queued = peer.pending.splice(0)
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate)
      } catch {
        // Ignore candidates that no longer match.
      }
    }
  }

  private sendDescription(id: string, description: RTCSessionDescription | null) {
    if (!description || this.closed) return
    this.socket.emit('signal', {
      to: id,
      data: { description },
    })
  }
}
