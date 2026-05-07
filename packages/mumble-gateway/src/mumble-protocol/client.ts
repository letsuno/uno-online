import tls from 'node:tls'
import { setInterval, clearInterval } from 'node:timers'
import type { ChannelState, UserState } from '../types.js'
import {
  type ContextActionModifyMessage,
  type CryptSetupMessage,
  type PermissionQueryMessage,
  type ServerConfigMessage,
  TcpMessageType,
  decodeChannelRemove,
  decodeChannelState,
  decodeCodecVersion,
  decodeContextActionModify,
  decodeCryptSetup,
  decodePermissionDenied,
  decodePermissionQuery,
  decodePing,
  decodeReject,
  decodeServerConfig,
  decodeServerSync,
  decodeTextMessage,
  decodeUserRemove,
  decodeUserState,
  decodeVersion,
  encodeAuthenticate,
  encodeCryptSetup,
  encodePermissionQuery,
  encodePing,
  encodeRequestBlob,
  encodeTextMessage,
  encodeUserState,
  encodeVersion
} from './messages.js'
import { TypedEmitter } from './typed-emitter.js'

export type MumbleTextMessage = {
  actor: number
  message: string
  targetSessions: number[]
  targetChannelIds: number[]
  targetTreeIds: number[]
}

export type MumbleReject = {
  type?: number
  reason?: string
}

export type MumblePermissionDenied = {
  permission?: number
  channelId?: number
  session?: number
  reason?: string
  type?: number
  name?: string
}

export type MumbleServerInfo = {
  welcomeMessage?: string
  maxBandwidth?: number
  version?: ReturnType<typeof decodeVersion>
  opus?: boolean
}

type Events = {
  channelUpsert: ChannelState
  channelRemove: number
  userUpsert: UserState
  userRemove: number
  textMessage: MumbleTextMessage
  serverRtt: number
  serverSync: MumbleServerInfo
  udpTunnel: Buffer
  cryptSetup: CryptSetupMessage
  reject: MumbleReject
  denied: MumblePermissionDenied
  contextActionModify: ContextActionModifyMessage
  permissionQuery: PermissionQueryMessage
  serverConfig: ServerConfigMessage
  error: unknown
  disconnected: undefined
  // Voice events are added in a later module (see voice.ts integration)
}

function versionV1(major: number, minor: number, patch: number): number {
  return ((major & 0xffff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff)
}

function textureToDataUrl(buf: Buffer): string {
  let mime = 'image/png'
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg'
    else if (buf[0] === 0x47 && buf[1] === 0x49) mime = 'image/gif'
  }
  return `data:${mime};base64,${buf.toString('base64')}`
}

export class MumbleTcpClient {
  private _socket: tls.TLSSocket
  private _buffer: Buffer = Buffer.alloc(0)
  private _closed = false
  private _keepaliveTimer: NodeJS.Timeout | null = null

  private _pendingPings = new Map<bigint, number>()
  private _tcpPackets = 0
  private _tcpPingSum = 0
  private _tcpPingSqSum = 0
  private _tcpPingCount = 0
  private _requestedTextureBlobs = new Set<number>()

  readonly events = new TypedEmitter<Events>()

  readonly channels = new Map<number, ChannelState>()
  readonly users = new Map<number, UserState>()

  private _synced = false

  selfUserId = 0
  rootChannelId = 0
  serverInfo: MumbleServerInfo = {}
  cryptSetup: CryptSetupMessage = {}

  constructor(socket: tls.TLSSocket) {
    this._socket = socket

    socket.on('data', (chunk) => this._onData(chunk))
    socket.once('close', (hadError) => {
      console.warn('[mumble-tcp] socket closed (hadError=%s, destroyed=%s, readyState=%s)',
        hadError, socket.destroyed, socket.readyState)
      this._onClose()
    })
    socket.on('error', (err) => {
      console.error('[mumble-tcp] socket error:', (err as Error).message ?? err)
      this.events.emit('error', err)
    })
  }

  static async connect(params: {
    host: string
    port: number
    rejectUnauthorized: boolean
    username: string
    password?: string
    tokens?: string[]
    cert?: string
    key?: string
  }): Promise<MumbleTcpClient> {
    const socket = tls.connect({
      host: params.host,
      port: params.port,
      servername: params.host,
      rejectUnauthorized: params.rejectUnauthorized,
      ...(params.cert && params.key ? { cert: params.cert, key: params.key } : {})
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (err: unknown) => reject(err)
      socket.once('secureConnect', () => {
        socket.off('error', onError)
        resolve()
      })
      socket.once('error', onError)
    })

    const client = new MumbleTcpClient(socket)

    // Use protocol version < 1.5 to stick to legacy UDP packet format.
    client.sendMessage(TcpMessageType.Version, encodeVersion({
      versionV1: versionV1(1, 4, 0),
      release: 'mumble-web gateway',
      os: 'node',
      osVersion: process.version
    }))

    client.sendMessage(TcpMessageType.Authenticate, encodeAuthenticate({
      username: params.username,
      ...(params.password != null ? { password: params.password } : {}),
      ...(params.tokens != null ? { tokens: params.tokens } : {}),
      opus: true,
      clientType: 0
    }))

    client._keepaliveTimer = setInterval(() => {
      if (client._closed) return
      client._tcpPackets++
      const ts = BigInt(Date.now())
      client._pendingPings.set(ts, Date.now())
      const tcpPingAvg = client._tcpPingCount > 0 ? client._tcpPingSum / client._tcpPingCount : 0
      const tcpPingVar = client._tcpPingCount > 1
        ? (client._tcpPingSqSum / client._tcpPingCount) - (tcpPingAvg * tcpPingAvg)
        : 0
      client.sendMessage(TcpMessageType.Ping, encodePing({
        timestamp: ts,
        good: 0,
        late: 0,
        lost: 0,
        resync: 0,
        udpPackets: 0,
        tcpPackets: client._tcpPackets,
        udpPingAvg: 0,
        udpPingVar: 0,
        tcpPingAvg,
        tcpPingVar: Math.max(0, tcpPingVar),
      }))
    }, 5_000)

    return client
  }

  close(): void {
    if (this._closed) return
    this._closed = true
    if (this._keepaliveTimer) clearInterval(this._keepaliveTimer)
    this._keepaliveTimer = null
    try {
      this._socket.end()
    } catch {}
    try {
      this._socket.destroy()
    } catch {}
  }

  sendMessage(type: TcpMessageType, payload: Buffer): void {
    if (this._closed) return
    const header = Buffer.allocUnsafe(6)
    header.writeUInt16BE(type, 0)
    header.writeUInt32BE(payload.length >>> 0, 2)
    try {
      this._socket.write(Buffer.concat([header, payload]))
    } catch (err) {
      this.events.emit('error', err)
    }
  }

  joinChannel(channelId: number): void {
    if (!Number.isFinite(channelId)) return
    const payload = encodeUserState({
      ...(this.selfUserId ? { session: this.selfUserId } : {}),
      channelId
    })
    this.sendMessage(TcpMessageType.UserState, payload)
  }

  listenChannel(channelId: number): void {
    if (!Number.isFinite(channelId)) return
    const payload = encodeUserState({
      ...(this.selfUserId ? { session: this.selfUserId } : {}),
      listeningChannelAdd: [channelId]
    })
    this.sendMessage(TcpMessageType.UserState, payload)
  }

  unlistenChannel(channelId: number): void {
    if (!Number.isFinite(channelId)) return
    const payload = encodeUserState({
      ...(this.selfUserId ? { session: this.selfUserId } : {}),
      listeningChannelRemove: [channelId]
    })
    this.sendMessage(TcpMessageType.UserState, payload)
  }

  sendTextMessage(params: { message: string; channelId?: number; userId?: number }): void {
    const message = params.message?.toString?.() ?? ''
    if (!message.trim()) return

    const targetSessions = params.userId != null ? [params.userId] : undefined
    const selfChannelId = this.selfUserId ? this.users.get(this.selfUserId)?.channelId : null
    const targetChannelId = params.userId == null ? (params.channelId ?? selfChannelId) : null
    const targetChannelIds = targetChannelId != null ? [targetChannelId] : undefined

    const payload = encodeTextMessage({
      message,
      ...(targetSessions ? { targetSessions } : {}),
      ...(targetChannelIds ? { targetChannelIds } : {})
    })

    this.sendMessage(TcpMessageType.TextMessage, payload)
  }

  sendCryptSetup(msg: CryptSetupMessage): void {
    this.sendMessage(TcpMessageType.CryptSetup, encodeCryptSetup(msg))
  }

  queryPermission(channelId: number): void {
    this.sendMessage(TcpMessageType.PermissionQuery, encodePermissionQuery({ channelId }))
  }

  private _onClose() {
    if (this._keepaliveTimer) clearInterval(this._keepaliveTimer)
    this._keepaliveTimer = null
    this._closed = true
    this.events.emit('disconnected', undefined)
  }

  private _onData(chunk: Buffer) {
    this._buffer = this._buffer.length ? Buffer.concat([this._buffer, chunk]) : chunk

    while (this._buffer.length >= 6) {
      const type = this._buffer.readUInt16BE(0)
      const length = this._buffer.readUInt32BE(2)
      const total = 6 + length
      if (this._buffer.length < total) break

      const payload = this._buffer.subarray(6, total)
      this._buffer = this._buffer.subarray(total)

      this._handleMessage(type, payload)
    }
  }

  private _handleMessage(type: number, payload: Buffer) {
    try {
      switch (type) {
        case TcpMessageType.Version: {
          this.serverInfo.version = decodeVersion(payload)
          return
        }
        case TcpMessageType.Reject: {
          const rej = decodeReject(payload)
          this.events.emit('reject', rej)
          this.close()
          return
        }
        case TcpMessageType.ServerSync: {
          const sync = decodeServerSync(payload)
          if (sync.session != null) this.selfUserId = sync.session
          if (sync.maxBandwidth != null) this.serverInfo.maxBandwidth = sync.maxBandwidth
          if (sync.welcomeText != null) this.serverInfo.welcomeMessage = sync.welcomeText
          this._synced = true
          this.events.emit('serverSync', { ...this.serverInfo })
          for (const id of this.channels.keys()) {
            this.queryPermission(id)
          }
          return
        }
        case TcpMessageType.Ping: {
          const ping = decodePing(payload)
          if (ping.timestamp != null) {
            const sent = this._pendingPings.get(ping.timestamp)
            if (sent != null) {
              this._pendingPings.delete(ping.timestamp)
              const rtt = Date.now() - sent
              this._tcpPingCount++
              this._tcpPingSum += rtt
              this._tcpPingSqSum += rtt * rtt
              this.events.emit('serverRtt', rtt)
            }
          }
          return
        }
        case TcpMessageType.ChannelState: {
          const ch = decodeChannelState(payload)
          if (ch.channelId == null) return
          const prev = this.channels.get(ch.channelId)
          const linksPrev = prev?.links ?? []

          let links: number[] | undefined
          if (ch.links.length) {
            links = [...ch.links]
          } else if (ch.linksAdd.length || ch.linksRemove.length) {
            const set = new Set(linksPrev)
            for (const id of ch.linksAdd) set.add(id)
            for (const id of ch.linksRemove) set.delete(id)
            links = [...set]
          } else {
            links = prev?.links
          }

          const next: ChannelState = {
            id: ch.channelId,
            name: ch.name ?? prev?.name ?? '',
            parentId: ch.channelId === 0 ? null : (ch.parent ?? prev?.parentId ?? null)
          }
          const position = ch.position ?? prev?.position
          if (position != null) next.position = position
          const description = ch.description ?? prev?.description
          if (description != null) next.description = description
          if (links && links.length) next.links = links

          const isNew = !prev
          this.channels.set(next.id, next)
          this.events.emit('channelUpsert', next)
          if (isNew && this._synced) {
            this.queryPermission(next.id)
          }
          return
        }
        case TcpMessageType.ChannelRemove: {
          const msg = decodeChannelRemove(payload)
          this.channels.delete(msg.channelId)
          this.events.emit('channelRemove', msg.channelId)
          return
        }
        case TcpMessageType.UserState: {
          const u = decodeUserState(payload)
          if (u.session == null) return
          const prev = this.users.get(u.session)
          const next: UserState = {
            id: u.session,
            name: u.name ?? prev?.name ?? '',
            // Murmur omits channel_id for *other users* when they are in the root channel (id=0).
            // Treat missing channel_id as "unchanged", and default to root (0) for first sight.
            channelId: u.channelId ?? prev?.channelId ?? 0
          }
          const mute = u.mute ?? prev?.mute
          const deaf = u.deaf ?? prev?.deaf
          const suppress = u.suppress ?? prev?.suppress
          const selfMute = u.selfMute ?? prev?.selfMute
          const selfDeaf = u.selfDeaf ?? prev?.selfDeaf
          if (mute != null) next.mute = mute
          if (deaf != null) next.deaf = deaf
          if (suppress != null) next.suppress = suppress
          if (selfMute != null) next.selfMute = selfMute
          if (selfDeaf != null) next.selfDeaf = selfDeaf
          if (u.texture != null && u.texture.length > 0) {
            next.texture = textureToDataUrl(u.texture)
            this._requestedTextureBlobs.delete(u.session)
          } else if (u.texture == null && prev?.texture) {
            next.texture = prev.texture
          }

          // Track listening channels (incremental add/remove)
          if (u.listeningChannelAdd.length || u.listeningChannelRemove.length) {
            const set = new Set(prev?.listeningChannelIds ?? [])
            for (const id of u.listeningChannelAdd) set.add(id)
            for (const id of u.listeningChannelRemove) set.delete(id)
            if (set.size > 0) next.listeningChannelIds = [...set]
          } else if (prev?.listeningChannelIds) {
            next.listeningChannelIds = prev.listeningChannelIds
          }

          // Server sent texture_hash without full texture — request the blob.
          if (!next.texture && u.textureHash != null && u.textureHash.length > 0 && !this._requestedTextureBlobs.has(u.session)) {
            this._requestedTextureBlobs.add(u.session)
            this.sendMessage(TcpMessageType.RequestBlob, encodeRequestBlob({ sessionTextures: [u.session] }))
          }

          this.users.set(next.id, next)
          this.events.emit('userUpsert', next)
          return
        }
        case TcpMessageType.UserRemove: {
          const msg = decodeUserRemove(payload)
          if (msg.session === this.selfUserId) {
            console.warn('[mumble-tcp] self removed: session=%d actor=%d reason=%s ban=%s',
              msg.session, msg.actor ?? -1, msg.reason ?? '(none)', msg.ban ?? false)
          }
          this.users.delete(msg.session)
          this.events.emit('userRemove', msg.session)
          return
        }
        case TcpMessageType.TextMessage: {
          const msg = decodeTextMessage(payload)
          this.events.emit('textMessage', {
            actor: msg.actor ?? 0,
            message: msg.message ?? '',
            targetSessions: msg.sessions,
            targetChannelIds: msg.channelIds,
            targetTreeIds: msg.treeIds
          })
          return
        }
        case TcpMessageType.PermissionDenied: {
          const denied = decodePermissionDenied(payload)
          this.events.emit('denied', denied)
          return
        }
        case TcpMessageType.CodecVersion: {
          const codec = decodeCodecVersion(payload)
          if (codec.opus != null) this.serverInfo.opus = codec.opus
          return
        }
        case TcpMessageType.UDPTunnel:
          this.events.emit('udpTunnel', payload)
          return
        case TcpMessageType.CryptSetup: {
          const msg = decodeCryptSetup(payload)
          if (msg.key != null) this.cryptSetup.key = Buffer.from(msg.key)
          if (msg.clientNonce != null) this.cryptSetup.clientNonce = Buffer.from(msg.clientNonce)
          if (msg.serverNonce != null) this.cryptSetup.serverNonce = Buffer.from(msg.serverNonce)
          this.events.emit('cryptSetup', msg)
          return
        }
        case TcpMessageType.ContextActionModify: {
          const msg = decodeContextActionModify(payload)
          this.events.emit('contextActionModify', msg)
          return
        }
        case TcpMessageType.PermissionQuery: {
          const msg = decodePermissionQuery(payload)
          this.events.emit('permissionQuery', msg)
          return
        }
        case TcpMessageType.ServerConfig: {
          const msg = decodeServerConfig(payload)
          if (msg.maxBandwidth != null) this.serverInfo.maxBandwidth = msg.maxBandwidth
          if (msg.welcomeText != null) this.serverInfo.welcomeMessage = msg.welcomeText
          this.events.emit('serverConfig', msg)
          return
        }
        default:
          console.log('[mumble-tcp] unhandled message type=%d len=%d', type, payload.length)
          return
      }
    } catch (err) {
      this.events.emit('error', err)
    }
  }
}
