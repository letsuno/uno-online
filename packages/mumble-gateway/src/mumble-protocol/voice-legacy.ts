export type MumbleVarintReadResult = {
  value: bigint
  offset: number
}

function requireBytes(buf: Buffer, offset: number, n: number): void {
  if (offset + n > buf.length) throw new Error('Unexpected EOF')
}

export function readMumbleVarint(buf: Buffer, offset: number): MumbleVarintReadResult {
  requireBytes(buf, offset, 1)
  const v = buf.readUInt8(offset)
  offset += 1

  if ((v & 0x80) === 0x00) {
    return { value: BigInt(v & 0x7f), offset }
  }

  if ((v & 0xc0) === 0x80) {
    requireBytes(buf, offset, 1)
    const b1 = buf.readUInt8(offset)
    offset += 1
    const value = BigInt((v & 0x3f) << 8 | b1)
    return { value, offset }
  }

  if ((v & 0xf0) === 0xf0) {
    switch (v & 0xfc) {
      case 0xf0: {
        requireBytes(buf, offset, 4)
        const b0 = BigInt(buf.readUInt8(offset))
        const b1 = BigInt(buf.readUInt8(offset + 1))
        const b2 = BigInt(buf.readUInt8(offset + 2))
        const b3 = BigInt(buf.readUInt8(offset + 3))
        offset += 4
        const value = (b0 << 24n) | (b1 << 16n) | (b2 << 8n) | b3
        return { value, offset }
      }
      case 0xf4: {
        requireBytes(buf, offset, 8)
        let value = 0n
        for (let i = 0; i < 8; i++) {
          value = (value << 8n) | BigInt(buf.readUInt8(offset + i))
        }
        offset += 8
        return { value, offset }
      }
      case 0xf8: {
        const inner = readMumbleVarint(buf, offset)
        return { value: ~inner.value, offset: inner.offset }
      }
      case 0xfc: {
        const value = BigInt(v & 0x03)
        return { value: ~value, offset }
      }
      default:
        throw new Error('Invalid mumble varint prefix')
    }
  }

  if ((v & 0xf0) === 0xe0) {
    requireBytes(buf, offset, 3)
    const b1 = BigInt(buf.readUInt8(offset))
    const b2 = BigInt(buf.readUInt8(offset + 1))
    const b3 = BigInt(buf.readUInt8(offset + 2))
    offset += 3
    const value = (BigInt(v & 0x0f) << 24n) | (b1 << 16n) | (b2 << 8n) | b3
    return { value, offset }
  }

  if ((v & 0xe0) === 0xc0) {
    requireBytes(buf, offset, 2)
    const b1 = BigInt(buf.readUInt8(offset))
    const b2 = BigInt(buf.readUInt8(offset + 1))
    offset += 2
    const value = (BigInt(v & 0x1f) << 16n) | (b1 << 8n) | b2
    return { value, offset }
  }

  throw new Error('Invalid mumble varint prefix')
}

export function writeMumbleVarint(value: bigint): Buffer {
  // We only need unsigned values for voice packets at the moment.
  const i = value
  if (i < 0n) throw new Error('Negative varint not supported')

  if (i < 0x80n) {
    return Buffer.from([Number(i)])
  }
  if (i < 0x4000n) {
    return Buffer.from([Number((i >> 8n) | 0x80n), Number(i & 0xffn)])
  }
  if (i < 0x200000n) {
    return Buffer.from([Number((i >> 16n) | 0xc0n), Number((i >> 8n) & 0xffn), Number(i & 0xffn)])
  }
  if (i < 0x10000000n) {
    return Buffer.from([
      Number((i >> 24n) | 0xe0n),
      Number((i >> 16n) & 0xffn),
      Number((i >> 8n) & 0xffn),
      Number(i & 0xffn)
    ])
  }
  if (i < 0x100000000n) {
    return Buffer.from([
      0xf0,
      Number((i >> 24n) & 0xffn),
      Number((i >> 16n) & 0xffn),
      Number((i >> 8n) & 0xffn),
      Number(i & 0xffn)
    ])
  }

  return Buffer.from([
    0xf4,
    Number((i >> 56n) & 0xffn),
    Number((i >> 48n) & 0xffn),
    Number((i >> 40n) & 0xffn),
    Number((i >> 32n) & 0xffn),
    Number((i >> 24n) & 0xffn),
    Number((i >> 16n) & 0xffn),
    Number((i >> 8n) & 0xffn),
    Number(i & 0xffn)
  ])
}

export type DecodedLegacyOpusPacket = {
  kind: 'opus'
  target: number
  sessionId: number
  sequence: bigint
  isLastFrame: boolean
  opusData: Buffer
}

export type DecodedLegacyPingPacket = {
  kind: 'ping'
  timestamp: bigint
}

export type DecodedLegacyVoicePacket = DecodedLegacyOpusPacket | DecodedLegacyPingPacket

export function decodeLegacyVoicePacketFromServer(buf: Buffer): DecodedLegacyVoicePacket | null {
  if (!buf.length) return null
  const header = buf.readUInt8(0)
  const type = header >> 5
  const target = header & 0x1f

  let offset = 1

  // Ping
  if (type === 1) {
    const ts = readMumbleVarint(buf, offset)
    return { kind: 'ping', timestamp: ts.value }
  }

  // Opus
  if (type !== 4) return null

  const session = readMumbleVarint(buf, offset)
  offset = session.offset
  const seq = readMumbleVarint(buf, offset)
  offset = seq.offset

  const sizeTerm = readMumbleVarint(buf, offset)
  offset = sizeTerm.offset

  const sizeTermValue = Number(sizeTerm.value)
  const isLastFrame = (sizeTermValue & (1 << 13)) !== 0
  const size = sizeTermValue & 0x1fff

  if (size < 0 || offset + size > buf.length) return null
  const opusData = buf.subarray(offset, offset + size)

  return {
    kind: 'opus',
    target,
    sessionId: Number(session.value),
    sequence: seq.value,
    isLastFrame,
    opusData
  }
}

export function encodeLegacyPingPacket(timestamp: bigint): Buffer {
  return Buffer.concat([Buffer.from([0x20]), writeMumbleVarint(timestamp)])
}

export function encodeLegacyOpusPacketFromClient(params: { target: number; sequence: bigint; opusData?: Buffer; isLastFrame: boolean }): Buffer {
  const target = params.target & 0x1f
  const header = ((4 & 0x07) << 5) | target

  const opusData = params.opusData ?? Buffer.alloc(0)
  const size = opusData.length
  if (size > 0x1fff) throw new Error('Opus payload too large')

  const sizeTerm = params.isLastFrame ? BigInt(size | (1 << 13)) : BigInt(size)

  return Buffer.concat([
    Buffer.from([header]),
    writeMumbleVarint(params.sequence),
    writeMumbleVarint(sizeTerm),
    opusData
  ])
}
