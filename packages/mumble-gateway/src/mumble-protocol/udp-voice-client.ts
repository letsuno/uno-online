import dgram from 'node:dgram'
import net from 'node:net'
import { clearInterval, setInterval } from 'node:timers'
import type { MumbleTcpClient } from './client.js'
import type { CryptSetupMessage } from './messages.js'
import { TypedEmitter } from './typed-emitter.js'
import { CryptStateOCB2 } from './crypt-state-ocb2.js'
import { decodeLegacyVoicePacketFromServer, writeMumbleVarint } from './voice-legacy.js'

export type UdpVoiceOpusFrame = {
  userId: number
  target: number
  sequence: bigint
  isLastFrame: boolean
  opus: Buffer
}

type Events = {
  voiceOpus: UdpVoiceOpusFrame
  udpRtt: number
  udpReady: undefined
  error: unknown
}

function canApplyFullKey(msg: CryptSetupMessage): msg is Required<CryptSetupMessage> {
  return msg.key != null && msg.clientNonce != null && msg.serverNonce != null
}

export class MumbleUdpVoiceClient {
  private _tcp: MumbleTcpClient
  private _socket: dgram.Socket
  private _crypt = new CryptStateOCB2()
  private _pingTimer: NodeJS.Timeout | null = null
  private _udpReady = false
  private _closed = false

  private _pendingPings = new Map<bigint, number>()
  private _unsubscribers: Array<() => void> = []

  readonly events = new TypedEmitter<Events>()

  constructor(params: { tcp: MumbleTcpClient; host: string; port: number }) {
    const { tcp, host, port } = params
    this._tcp = tcp

    const ipVersion = net.isIP(host)
    const socketType = ipVersion === 6 ? 'udp6' : 'udp4'
    this._socket = dgram.createSocket(socketType)

    this._socket.on('message', (msg) => this._onUdpMessage(msg))
    this._socket.on('error', (err) => this.events.emit('error', err))

    // Set a default peer; required so socket.send() can be called without host/port.
    this._socket.connect(port, host)

    this._unsubscribers.push(
      tcp.events.on('cryptSetup', (msg) => this._onCryptSetup(msg))
    )

    // Apply an already-received CryptSetup (e.g. if the session is created after auth handshake).
    this._applyKnownCryptSetup(tcp.cryptSetup)
  }

  get udpReady(): boolean {
    return this._udpReady
  }

  canSend(): boolean {
    return !this._closed && this._crypt.isValid()
  }

  close(): void {
    if (this._closed) return
    this._closed = true

    if (this._pingTimer) clearInterval(this._pingTimer)
    this._pingTimer = null

    for (const off of this._unsubscribers) {
      try {
        off()
      } catch {}
    }
    this._unsubscribers = []

    try {
      this._socket.close()
    } catch {}
  }

  sendPlainPacket(plain: Buffer): boolean {
    if (!this.canSend()) return false

    const encrypted = this._crypt.encrypt(plain)
    if (!encrypted) return false

    try {
      this._socket.send(encrypted)
      return true
    } catch (err) {
      this.events.emit('error', err)
      return false
    }
  }

  private _applyKnownCryptSetup(state: CryptSetupMessage): void {
    if (canApplyFullKey(state)) {
      this._setKeyFromMessage(state)
    } else if (state.serverNonce != null) {
      this._crypt.setDecryptIV(state.serverNonce)
    }
  }

  private _onCryptSetup(msg: CryptSetupMessage): void {
    if (canApplyFullKey(msg)) {
      this._setKeyFromMessage(msg)
      return
    }

    if (msg.serverNonce != null) {
      this._crypt.setDecryptIV(msg.serverNonce)
      this._crypt.statsLocal.resync += 1
      return
    }

    // Server requested a resync; reply with our current encrypt IV.
    if (this._crypt.isValid()) {
      this._tcp.sendCryptSetup({ clientNonce: this._crypt.getEncryptIV() })
    }
  }

  private _setKeyFromMessage(msg: Required<CryptSetupMessage>): void {
    const ok = this._crypt.setKey(msg.key, msg.clientNonce, msg.serverNonce)
    if (!ok) return

    this._ensurePingTimer()
  }

  private _ensurePingTimer(): void {
    if (this._pingTimer) return
    this._sendPing()
    this._pingTimer = setInterval(() => this._sendPing(), 5_000)
  }

  private _sendPing(): void {
    if (!this._crypt.isValid() || this._closed) return

    const ts = BigInt(Date.now())
    const plain = Buffer.concat([Buffer.from([0x20]), writeMumbleVarint(ts)])

    const encrypted = this._crypt.encrypt(plain)
    if (!encrypted) return

    this._pendingPings.set(ts, Date.now())
    while (this._pendingPings.size > 10) {
      const first = this._pendingPings.keys().next().value as bigint | undefined
      if (first == null) break
      this._pendingPings.delete(first)
    }
    try {
      this._socket.send(encrypted)
    } catch {}
  }

  private _onUdpMessage(msg: Buffer): void {
    if (this._closed) return
    if (!this._crypt.isValid()) return

    const plain = this._crypt.decrypt(msg)
    if (!plain) return

    const decoded = decodeLegacyVoicePacketFromServer(plain)
    if (!decoded) return

    if (!this._udpReady) {
      this._udpReady = true
      this.events.emit('udpReady', undefined)
    }

    if (decoded.kind === 'ping') {
      const sentAt = this._pendingPings.get(decoded.timestamp)
      if (sentAt != null) {
        this._pendingPings.delete(decoded.timestamp)
        this.events.emit('udpRtt', Date.now() - sentAt)
      }
      return
    }

    if (decoded.kind === 'opus') {
      this.events.emit('voiceOpus', {
        userId: decoded.sessionId,
        target: decoded.target,
        sequence: decoded.sequence,
        isLastFrame: decoded.isLastFrame,
        opus: Buffer.from(decoded.opusData)
      })
    }
  }
}
