import type { ChannelState, ServerConfig, UserState } from './types.js'
import { getGatewayCert } from './tls-cert.js'
import { MumbleTcpClient, type MumblePermissionDenied, type MumbleReject, type MumbleTextMessage } from './mumble-protocol/client.js'
import { type ContextActionModifyMessage, type PermissionQueryMessage, type ServerConfigMessage, TcpMessageType } from './mumble-protocol/messages.js'
import { MumbleUdpVoiceClient } from './mumble-protocol/udp-voice-client.js'
import { decodeLegacyVoicePacketFromServer, encodeLegacyOpusPacketFromClient, encodeLegacyPingPacket } from './mumble-protocol/voice-legacy.js'
import { TypedEmitter } from './mumble-protocol/typed-emitter.js'

export type ConnectedMumble = {
  client: MumbleSession
  voiceTransport: 'tcp-tunnel' | 'udp'
  close: () => void
}

export type VoiceOpusFrame = {
  userId: number
  target: number
  sequence: bigint
  isLastFrame: boolean
  opus: Buffer
}

type SessionEvents = {
  channelUpsert: ChannelState
  channelRemove: number
  userUpsert: UserState
  userRemove: number
  textMessage: MumbleTextMessage
  serverRtt: number
  reject: MumbleReject
  denied: MumblePermissionDenied
  contextActionModify: ContextActionModifyMessage
  permissionQuery: PermissionQueryMessage
  serverConfig: ServerConfigMessage
  voiceOpus: VoiceOpusFrame
  error: unknown
  disconnected: undefined
}

export class MumbleSession {
  private _tcp: MumbleTcpClient
  private _udp: MumbleUdpVoiceClient | null = null
  private _outSequence = 0n
  private _unsubscribers: Array<() => void> = []
  private _udpFallbackTimer: NodeJS.Timeout | null = null

  private _recentVoiceFrames = new Map<string, number>()

  readonly events = new TypedEmitter<SessionEvents>()

  constructor(params: { tcp: MumbleTcpClient; udp?: { host: string; port: number } }) {
    const { tcp } = params
    this._tcp = tcp

    this._unsubscribers.push(
      tcp.events.on('channelUpsert', (ch) => this.events.emit('channelUpsert', ch)),
      tcp.events.on('channelRemove', (id) => this.events.emit('channelRemove', id)),
      tcp.events.on('userUpsert', (u) => this.events.emit('userUpsert', u)),
      tcp.events.on('userRemove', (id) => this.events.emit('userRemove', id)),
      tcp.events.on('textMessage', (m) => this.events.emit('textMessage', m)),
      tcp.events.on('serverRtt', (ms) => this.events.emit('serverRtt', ms)),
      tcp.events.on('reject', (r) => this.events.emit('reject', r)),
      tcp.events.on('denied', (d) => this.events.emit('denied', d)),
      tcp.events.on('contextActionModify', (m) => this.events.emit('contextActionModify', m)),
      tcp.events.on('permissionQuery', (m) => this.events.emit('permissionQuery', m)),
      tcp.events.on('serverConfig', (m) => this.events.emit('serverConfig', m)),
      tcp.events.on('error', (e) => this.events.emit('error', e)),
      tcp.events.on('disconnected', () => this.events.emit('disconnected', undefined)),
      tcp.events.on('udpTunnel', (pkt) => this._onTunnelPacket(pkt))
    )

    if (params.udp) {
      this._udp = new MumbleUdpVoiceClient({ tcp, host: params.udp.host, port: params.udp.port })
      this._unsubscribers.push(
        this._udp.events.on('voiceOpus', (frame) => this._emitVoice(frame)),
        this._udp.events.on('error', (e) => this.events.emit('error', e)),
        this._udp.events.on('udpReady', () => this._clearUdpFallbackTimer())
      )

      // If UDP can't be established quickly, force server back into TCP voice mode by tunneling a ping packet.
      // This avoids a regression where the server starts sending voice over UDP that the gateway can't receive.
      if (this._udp.canSend()) {
        this._udpFallbackTimer = setTimeout(() => {
          if (!this._udp || this._udp.udpReady) return
          try {
            const ping = encodeLegacyPingPacket(BigInt(Date.now()))
            this._tcp.sendMessage(TcpMessageType.UDPTunnel, ping)
          } catch {}
        }, 2_500)
      }
    }
  }

  get selfUserId() {
    return this._tcp.selfUserId
  }

  get rootChannelId() {
    return this._tcp.rootChannelId
  }

  get welcomeMessage() {
    return this._tcp.serverInfo.welcomeMessage
  }

  get serverVersion() {
    return this._tcp.serverInfo.version
  }

  get maxBandwidth() {
    return this._tcp.serverInfo.maxBandwidth
  }

  get channels(): ChannelState[] {
    return [...this._tcp.channels.values()]
  }

  get users(): UserState[] {
    return [...this._tcp.users.values()]
  }

  close(): void {
    this._clearUdpFallbackTimer()
    for (const off of this._unsubscribers) {
      try {
        off()
      } catch {}
    }
    this._unsubscribers = []

    if (this._udp) {
      try {
        this._udp.close()
      } catch {}
      this._udp = null
    }

    this._tcp.close()
  }

  joinChannel(channelId: number): void {
    this._tcp.joinChannel(channelId)
  }

  listenChannel(channelId: number): void {
    this._tcp.listenChannel(channelId)
  }

  unlistenChannel(channelId: number): void {
    this._tcp.unlistenChannel(channelId)
  }

  sendTextMessage(params: { message: string; channelId?: number; userId?: number }): void {
    this._tcp.sendTextMessage(params)
  }

  queryPermission(channelId: number): void {
    this._tcp.queryPermission(channelId)
  }

  sendOpusFrame(target: number, opus: Buffer): void {
    const packet = encodeLegacyOpusPacketFromClient({
      target,
      sequence: this._outSequence++,
      opusData: opus,
      isLastFrame: false
    })
    if (this._udp?.udpReady) {
      const ok = this._udp.sendPlainPacket(packet)
      if (ok) return
    }
    this._tcp.sendMessage(TcpMessageType.UDPTunnel, packet)
  }

  sendOpusEnd(target: number): void {
    const packet = encodeLegacyOpusPacketFromClient({
      target,
      sequence: this._outSequence++,
      opusData: Buffer.alloc(0),
      isLastFrame: true
    })
    if (this._udp?.udpReady) {
      const ok = this._udp.sendPlainPacket(packet)
      if (ok) return
    }
    this._tcp.sendMessage(TcpMessageType.UDPTunnel, packet)
  }

  private _onTunnelPacket(packet: Buffer): void {
    const decoded = decodeLegacyVoicePacketFromServer(packet)
    if (!decoded) return
    if (decoded.kind !== 'opus') return
    this._emitVoice({
      userId: decoded.sessionId,
      target: decoded.target,
      sequence: decoded.sequence,
      isLastFrame: decoded.isLastFrame,
      opus: Buffer.from(decoded.opusData)
    })
  }

  private _emitVoice(frame: VoiceOpusFrame): void {
    // De-dupe bursts when the server is switching between UDP and TCP-tunnel.
    const key = `${frame.userId}:${frame.target}:${frame.sequence.toString()}`
    const now = Date.now()
    const prev = this._recentVoiceFrames.get(key)
    if (prev != null && now - prev < 1000) return
    this._recentVoiceFrames.set(key, now)

    if (this._recentVoiceFrames.size > 2048) {
      for (const [k, ts] of this._recentVoiceFrames) {
        if (now - ts <= 1500) break
        this._recentVoiceFrames.delete(k)
      }
      if (this._recentVoiceFrames.size > 4096) this._recentVoiceFrames.clear()
    }

    this.events.emit('voiceOpus', frame)
  }

  private _clearUdpFallbackTimer(): void {
    if (!this._udpFallbackTimer) return
    clearTimeout(this._udpFallbackTimer)
    this._udpFallbackTimer = null
  }
}

export async function connectMumbleServer(params: {
  server: ServerConfig
  username: string
  password?: string
  tokens?: string[]
}): Promise<ConnectedMumble> {
  const { server, username, password, tokens } = params

  const gatewayCert = server.tls?.useCertificate ? await getGatewayCert() : null

  const tcp = await MumbleTcpClient.connect({
    host: server.host,
    port: server.port,
    rejectUnauthorized: server.tls?.rejectUnauthorized ?? true,
    username,
    ...(password != null ? { password } : {}),
    ...(tokens != null ? { tokens } : {}),
    ...(gatewayCert ? { cert: gatewayCert.cert, key: gatewayCert.key } : {})
  })

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for ServerSync'))
    }, 15_000)

    const cleanup = () => {
      clearTimeout(timeout)
      offSync()
      offReject()
      offErr()
      offDisc()
    }

    const offSync = tcp.events.on('serverSync', () => {
      cleanup()
      resolve()
    })

    const offReject = tcp.events.on('reject', (rej) => {
      cleanup()
      reject(new Error(`Connection rejected: ${rej.reason ?? 'unknown'}`))
    })

    const offErr = tcp.events.on('error', (err) => {
      cleanup()
      reject(err instanceof Error ? err : new Error(String(err)))
    })

    const offDisc = tcp.events.on('disconnected', () => {
      cleanup()
      reject(new Error('Disconnected before ServerSync'))
    })
  })

  const session = new MumbleSession({ tcp, ...(server.forceTcp ? { } : { udp: { host: server.host, port: server.port } }) })

  return {
    client: session,
    voiceTransport: server.forceTcp ? 'tcp-tunnel' : 'udp',
    close: () => session.close()
  }
}
