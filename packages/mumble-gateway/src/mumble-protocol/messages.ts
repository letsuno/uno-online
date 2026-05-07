import { ProtobufReader, ProtobufWriter } from './protobuf.js'

export enum TcpMessageType {
  Version = 0,
  UDPTunnel = 1,
  Authenticate = 2,
  Ping = 3,
  Reject = 4,
  ServerSync = 5,
  ChannelRemove = 6,
  ChannelState = 7,
  UserRemove = 8,
  UserState = 9,
  TextMessage = 11,
  PermissionDenied = 12,
  CryptSetup = 15,
  ContextActionModify = 16,
  PermissionQuery = 20,
  CodecVersion = 21,
  RequestBlob = 23,
  ServerConfig = 24
}

export type VersionMessage = {
  versionV1?: number
  versionV2?: bigint
  release?: string
  os?: string
  osVersion?: string
}

export function encodeVersion(msg: VersionMessage): Buffer {
  const w = new ProtobufWriter()
  if (msg.versionV1 != null) w.uint32(1, msg.versionV1)
  if (msg.release != null) w.string(2, msg.release)
  if (msg.os != null) w.string(3, msg.os)
  if (msg.osVersion != null) w.string(4, msg.osVersion)
  if (msg.versionV2 != null) w.uint64(5, msg.versionV2)
  return w.finish()
}

export function decodeVersion(buf: Buffer): VersionMessage {
  const r = new ProtobufReader(buf)
  const out: VersionMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.versionV1 = r.readUint32()
        break
      case 2:
        out.release = r.readString()
        break
      case 3:
        out.os = r.readString()
        break
      case 4:
        out.osVersion = r.readString()
        break
      case 5:
        out.versionV2 = r.readUint64()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type AuthenticateMessage = {
  username: string
  password?: string
  tokens?: string[]
  opus?: boolean
  clientType?: number
}

export function encodeAuthenticate(msg: AuthenticateMessage): Buffer {
  const w = new ProtobufWriter()
  w.string(1, msg.username)
  if (msg.password != null) w.string(2, msg.password)
  for (const token of msg.tokens ?? []) w.string(3, token)
  if (msg.opus != null) w.bool(5, msg.opus)
  if (msg.clientType != null) w.int32(6, msg.clientType)
  return w.finish()
}

export type PingMessage = {
  timestamp?: bigint
  good?: number
  late?: number
  lost?: number
  resync?: number
  udpPackets?: number
  tcpPackets?: number
  udpPingAvg?: number
  udpPingVar?: number
  tcpPingAvg?: number
  tcpPingVar?: number
}

export function encodePing(msg: PingMessage): Buffer {
  const w = new ProtobufWriter()
  if (msg.timestamp != null) w.uint64(1, msg.timestamp)
  if (msg.good != null) w.uint32(2, msg.good)
  if (msg.late != null) w.uint32(3, msg.late)
  if (msg.lost != null) w.uint32(4, msg.lost)
  if (msg.resync != null) w.uint32(5, msg.resync)
  if (msg.udpPackets != null) w.uint32(6, msg.udpPackets)
  if (msg.tcpPackets != null) w.uint32(7, msg.tcpPackets)
  if (msg.udpPingAvg != null) w.float(8, msg.udpPingAvg)
  if (msg.udpPingVar != null) w.float(9, msg.udpPingVar)
  if (msg.tcpPingAvg != null) w.float(10, msg.tcpPingAvg)
  if (msg.tcpPingVar != null) w.float(11, msg.tcpPingVar)
  return w.finish()
}

export function decodePing(buf: Buffer): PingMessage {
  const r = new ProtobufReader(buf)
  const out: PingMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    if (tag.fieldNumber === 1) {
      out.timestamp = r.readUint64()
    } else {
      r.skip(tag.wireType)
    }
  }
  return out
}

export type CryptSetupMessage = {
  key?: Buffer
  clientNonce?: Buffer
  serverNonce?: Buffer
}

export function encodeCryptSetup(msg: CryptSetupMessage): Buffer {
  const w = new ProtobufWriter()
  if (msg.key != null) w.bytes(1, msg.key)
  if (msg.clientNonce != null) w.bytes(2, msg.clientNonce)
  if (msg.serverNonce != null) w.bytes(3, msg.serverNonce)
  return w.finish()
}

export function decodeCryptSetup(buf: Buffer): CryptSetupMessage {
  const r = new ProtobufReader(buf)
  const out: CryptSetupMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.key = r.readBytes()
        break
      case 2:
        out.clientNonce = r.readBytes()
        break
      case 3:
        out.serverNonce = r.readBytes()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type RejectMessage = {
  type?: number
  reason?: string
}

export function decodeReject(buf: Buffer): RejectMessage {
  const r = new ProtobufReader(buf)
  const out: RejectMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.type = r.readUint32()
        break
      case 2:
        out.reason = r.readString()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type ServerSyncMessage = {
  session?: number
  maxBandwidth?: number
  welcomeText?: string
  permissions?: bigint
}

export function decodeServerSync(buf: Buffer): ServerSyncMessage {
  const r = new ProtobufReader(buf)
  const out: ServerSyncMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.session = r.readUint32()
        break
      case 2:
        out.maxBandwidth = r.readUint32()
        break
      case 3:
        out.welcomeText = r.readString()
        break
      case 4:
        out.permissions = r.readUint64()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type ChannelStateMessage = {
  channelId?: number
  parent?: number
  name?: string
  links: number[]
  linksAdd: number[]
  linksRemove: number[]
  description?: string
  position?: number
}

export function decodeChannelState(buf: Buffer): ChannelStateMessage {
  const r = new ProtobufReader(buf)
  const out: ChannelStateMessage = { links: [], linksAdd: [], linksRemove: [] }
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.channelId = r.readUint32()
        break
      case 2:
        out.parent = r.readUint32()
        break
      case 3:
        out.name = r.readString()
        break
      case 4:
        out.links.push(r.readUint32())
        break
      case 5:
        out.description = r.readString()
        break
      case 6:
        out.linksAdd.push(r.readUint32())
        break
      case 7:
        out.linksRemove.push(r.readUint32())
        break
      case 9:
        out.position = r.readInt32()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type ChannelRemoveMessage = {
  channelId: number
}

export function decodeChannelRemove(buf: Buffer): ChannelRemoveMessage {
  const r = new ProtobufReader(buf)
  let channelId: number | undefined
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    if (tag.fieldNumber === 1) {
      channelId = r.readUint32()
    } else {
      r.skip(tag.wireType)
    }
  }
  if (channelId == null) throw new Error('ChannelRemove missing channel_id')
  return { channelId }
}

export type UserStateMessage = {
  session?: number
  name?: string
  channelId?: number
  mute?: boolean
  deaf?: boolean
  suppress?: boolean
  selfMute?: boolean
  selfDeaf?: boolean
  texture?: Buffer
  textureHash?: Buffer
  listeningChannelAdd: number[]
  listeningChannelRemove: number[]
}

export function decodeUserState(buf: Buffer): UserStateMessage {
  const r = new ProtobufReader(buf)
  const out: UserStateMessage = { listeningChannelAdd: [], listeningChannelRemove: [] }
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.session = r.readUint32()
        break
      case 3:
        out.name = r.readString()
        break
      case 5:
        out.channelId = r.readUint32()
        break
      case 6:
        out.mute = r.readBool()
        break
      case 7:
        out.deaf = r.readBool()
        break
      case 8:
        out.suppress = r.readBool()
        break
      case 9:
        out.selfMute = r.readBool()
        break
      case 10:
        out.selfDeaf = r.readBool()
        break
      case 11:
        out.texture = r.readBytes()
        break
      case 17:
        out.textureHash = r.readBytes()
        break
      case 21:
        out.listeningChannelAdd.push(r.readUint32())
        break
      case 22:
        out.listeningChannelRemove.push(r.readUint32())
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type UserRemoveMessage = {
  session: number
  actor?: number
  reason?: string
  ban?: boolean
}

export function decodeUserRemove(buf: Buffer): UserRemoveMessage {
  const r = new ProtobufReader(buf)
  let session: number | undefined
  let actor: number | undefined
  let reason: string | undefined
  let ban: boolean | undefined
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        session = r.readUint32()
        break
      case 2:
        actor = r.readUint32()
        break
      case 3:
        reason = r.readString()
        break
      case 4:
        ban = r.readBool()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  if (session == null) throw new Error('UserRemove missing session')
  return { session, ...(actor != null ? { actor } : {}), ...(reason != null ? { reason } : {}), ...(ban != null ? { ban } : {}) }
}

export type TextMessageMessage = {
  actor?: number
  sessions: number[]
  channelIds: number[]
  treeIds: number[]
  message?: string
}

export function decodeTextMessage(buf: Buffer): TextMessageMessage {
  const r = new ProtobufReader(buf)
  const out: TextMessageMessage = { sessions: [], channelIds: [], treeIds: [] }
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.actor = r.readUint32()
        break
      case 2:
        out.sessions.push(r.readUint32())
        break
      case 3:
        out.channelIds.push(r.readUint32())
        break
      case 4:
        out.treeIds.push(r.readUint32())
        break
      case 5:
        out.message = r.readString()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type PermissionDeniedMessage = {
  permission?: number
  channelId?: number
  session?: number
  reason?: string
  type?: number
  name?: string
}

export function decodePermissionDenied(buf: Buffer): PermissionDeniedMessage {
  const r = new ProtobufReader(buf)
  const out: PermissionDeniedMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.permission = r.readUint32()
        break
      case 2:
        out.channelId = r.readUint32()
        break
      case 3:
        out.session = r.readUint32()
        break
      case 4:
        out.reason = r.readString()
        break
      case 5:
        out.type = r.readUint32()
        break
      case 6:
        out.name = r.readString()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export type CodecVersionMessage = {
  opus?: boolean
}

export function decodeCodecVersion(buf: Buffer): CodecVersionMessage {
  const r = new ProtobufReader(buf)
  const out: CodecVersionMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    if (tag.fieldNumber === 4) {
      out.opus = r.readBool()
    } else {
      r.skip(tag.wireType)
    }
  }
  return out
}

export type OutboundTextMessage = {
  message: string
  targetSessions?: number[]
  targetChannelIds?: number[]
  targetTreeIds?: number[]
}

export function encodeTextMessage(msg: OutboundTextMessage): Buffer {
  const w = new ProtobufWriter()
  for (const s of msg.targetSessions ?? []) w.uint32(2, s)
  for (const c of msg.targetChannelIds ?? []) w.uint32(3, c)
  for (const t of msg.targetTreeIds ?? []) w.uint32(4, t)
  w.string(5, msg.message)
  return w.finish()
}

export type OutboundUserState = {
  session?: number
  channelId?: number
  listeningChannelAdd?: number[]
  listeningChannelRemove?: number[]
}

export function encodeUserState(msg: OutboundUserState): Buffer {
  const w = new ProtobufWriter()
  if (msg.session != null) w.uint32(1, msg.session)
  if (msg.channelId != null) w.uint32(5, msg.channelId)
  for (const id of msg.listeningChannelAdd ?? []) w.uint32(21, id)
  for (const id of msg.listeningChannelRemove ?? []) w.uint32(22, id)
  return w.finish()
}

export function encodeRequestBlob(params: {
  sessionTextures?: number[]
  sessionComments?: number[]
  channelDescriptions?: number[]
}): Buffer {
  const w = new ProtobufWriter()
  for (const s of params.sessionTextures ?? []) w.uint32(1, s)
  for (const s of params.sessionComments ?? []) w.uint32(2, s)
  for (const c of params.channelDescriptions ?? []) w.uint32(3, c)
  return w.finish()
}

// --- ContextActionModify (type 16) ---

export type ContextActionModifyMessage = {
  action?: string
  text?: string
  context?: number
  operation?: number
}

export function decodeContextActionModify(buf: Buffer): ContextActionModifyMessage {
  const r = new ProtobufReader(buf)
  const out: ContextActionModifyMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.action = r.readString()
        break
      case 2:
        out.text = r.readString()
        break
      case 3:
        out.context = r.readUint32()
        break
      case 4:
        out.operation = r.readUint32()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

// --- PermissionQuery (type 20) ---

export type PermissionQueryMessage = {
  channelId?: number
  permissions?: number
  flush?: boolean
}

export function decodePermissionQuery(buf: Buffer): PermissionQueryMessage {
  const r = new ProtobufReader(buf)
  const out: PermissionQueryMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.channelId = r.readUint32()
        break
      case 2:
        out.permissions = r.readUint32()
        break
      case 3:
        out.flush = r.readBool()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}

export function encodePermissionQuery(msg: PermissionQueryMessage): Buffer {
  const w = new ProtobufWriter()
  if (msg.channelId != null) w.uint32(1, msg.channelId)
  if (msg.permissions != null) w.uint32(2, msg.permissions)
  if (msg.flush != null) w.bool(3, msg.flush)
  return w.finish()
}

// --- ServerConfig (type 24) ---

export type ServerConfigMessage = {
  maxBandwidth?: number
  welcomeText?: string
  allowHtml?: boolean
  messageLength?: number
  imageMessageLength?: number
  maxUsers?: number
  recordingAllowed?: boolean
}

export function decodeServerConfig(buf: Buffer): ServerConfigMessage {
  const r = new ProtobufReader(buf)
  const out: ServerConfigMessage = {}
  for (;;) {
    const tag = r.readTag()
    if (!tag) break
    switch (tag.fieldNumber) {
      case 1:
        out.maxBandwidth = r.readUint32()
        break
      case 2:
        out.welcomeText = r.readString()
        break
      case 3:
        out.allowHtml = r.readBool()
        break
      case 4:
        out.messageLength = r.readUint32()
        break
      case 5:
        out.imageMessageLength = r.readUint32()
        break
      case 6:
        out.maxUsers = r.readUint32()
        break
      case 7:
        out.recordingAllowed = r.readBool()
        break
      default:
        r.skip(tag.wireType)
        break
    }
  }
  return out
}
