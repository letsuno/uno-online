export const VOICE_UPLINK_END = 0x03

export const VOICE_DOWNLINK_OPUS = 0x11
export const VOICE_UPLINK_OPUS = 0x12

export const DOWNLINK_OPUS_HEADER_BYTES = 11
export const UPLINK_OPUS_HEADER_BYTES = 4

export type DecodedUplinkVoice =
  | { type: 'opus'; target: number; opus: Buffer }
  | { type: 'end' }

export function decodeUplinkVoiceMessage(buf: Buffer): DecodedUplinkVoice | null {
  if (buf.length < 1) return null
  const kind = buf.readUInt8(0)

  if (kind === VOICE_UPLINK_END) {
    return { type: 'end' }
  }

  if (kind === VOICE_UPLINK_OPUS) {
    if (buf.length < UPLINK_OPUS_HEADER_BYTES) return null
    const target = buf.readUInt8(1) & 0x1f
    const payload = buf.subarray(UPLINK_OPUS_HEADER_BYTES)
    const copied = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
    return { type: 'opus', target, opus: Buffer.from(copied) }
  }

  return null
}

export function encodeDownlinkOpus(params: {
  userId: number
  target: number
  sequence: number
  isLastFrame: boolean
  opus: Buffer
}): Buffer {
  const { userId, target, sequence, isLastFrame, opus } = params
  const payloadBytes = opus.byteLength

  const buf = Buffer.allocUnsafe(DOWNLINK_OPUS_HEADER_BYTES + payloadBytes)
  buf.writeUInt8(VOICE_DOWNLINK_OPUS, 0)
  buf.writeUInt32LE(userId >>> 0, 1)
  buf.writeUInt8(target & 0x1f, 5)
  buf.writeUInt8(isLastFrame ? 0x01 : 0x00, 6)
  buf.writeUInt32LE(sequence >>> 0, 7)
  opus.copy(buf, DOWNLINK_OPUS_HEADER_BYTES)
  return buf
}
