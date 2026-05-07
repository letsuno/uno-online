export type ProtobufTag = {
  fieldNumber: number
  wireType: number
}

export class ProtobufReader {
  private _buf: Buffer
  private _pos = 0

  constructor(buf: Buffer) {
    this._buf = buf
  }

  get pos() {
    return this._pos
  }

  get len() {
    return this._buf.length
  }

  eof() {
    return this._pos >= this._buf.length
  }

  readTag(): ProtobufTag | null {
    if (this.eof()) return null
    const tag = this.readVarint()
    const wireType = Number(tag & 0x7n)
    const fieldNumber = Number(tag >> 3n)
    return { fieldNumber, wireType }
  }

  readVarint(): bigint {
    let shift = 0n
    let value = 0n

    for (let i = 0; i < 10; i++) {
      if (this._pos >= this._buf.length) {
        throw new Error('Unexpected EOF while reading varint')
      }
      const b = this._buf[this._pos++]!
      value |= BigInt(b & 0x7f) << shift
      if ((b & 0x80) === 0) return value
      shift += 7n
    }

    throw new Error('Varint too long')
  }

  readUint32(): number {
    const v = this.readVarint()
    return Number(BigInt.asUintN(32, v))
  }

  readInt32(): number {
    const v = this.readVarint()
    return Number(BigInt.asIntN(32, v))
  }

  readUint64(): bigint {
    return BigInt.asUintN(64, this.readVarint())
  }

  readBool(): boolean {
    return this.readVarint() !== 0n
  }

  readBytes(): Buffer {
    const length = this.readUint32()
    const end = this._pos + length
    if (end > this._buf.length) throw new Error('Unexpected EOF while reading bytes')
    const out = this._buf.subarray(this._pos, end)
    this._pos = end
    return out
  }

  readString(): string {
    return this.readBytes().toString('utf8')
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0: {
        this.readVarint()
        return
      }
      case 1: {
        this._pos += 8
        if (this._pos > this._buf.length) throw new Error('Unexpected EOF while skipping fixed64')
        return
      }
      case 2: {
        const length = this.readUint32()
        this._pos += length
        if (this._pos > this._buf.length) throw new Error('Unexpected EOF while skipping bytes')
        return
      }
      case 5: {
        this._pos += 4
        if (this._pos > this._buf.length) throw new Error('Unexpected EOF while skipping fixed32')
        return
      }
      default:
        throw new Error(`Unsupported protobuf wireType: ${wireType}`)
    }
  }
}

export class ProtobufWriter {
  private _chunks: Buffer[] = []

  private _pushVarint(value: bigint): void {
    let v = BigInt.asUintN(64, value)
    while (v >= 0x80n) {
      const b = Number((v & 0x7fn) | 0x80n)
      this._chunks.push(Buffer.from([b]))
      v >>= 7n
    }
    this._chunks.push(Buffer.from([Number(v)]))
  }

  private _pushTag(fieldNumber: number, wireType: number): void {
    const tag = (BigInt(fieldNumber) << 3n) | BigInt(wireType & 0x7)
    this._pushVarint(tag)
  }

  uint32(fieldNumber: number, value: number): void {
    this._pushTag(fieldNumber, 0)
    this._pushVarint(BigInt.asUintN(32, BigInt(value)))
  }

  int32(fieldNumber: number, value: number): void {
    this._pushTag(fieldNumber, 0)
    // int32 is encoded as sign-extended varint (no zigzag)
    this._pushVarint(BigInt.asUintN(64, BigInt.asIntN(32, BigInt(value))))
  }

  uint64(fieldNumber: number, value: bigint): void {
    this._pushTag(fieldNumber, 0)
    this._pushVarint(BigInt.asUintN(64, value))
  }

  bool(fieldNumber: number, value: boolean): void {
    this._pushTag(fieldNumber, 0)
    this._pushVarint(value ? 1n : 0n)
  }

  bytes(fieldNumber: number, value: Buffer): void {
    this._pushTag(fieldNumber, 2)
    this._pushVarint(BigInt(value.length))
    this._chunks.push(value)
  }

  string(fieldNumber: number, value: string): void {
    this.bytes(fieldNumber, Buffer.from(value, 'utf8'))
  }

  float(fieldNumber: number, value: number): void {
    this._pushTag(fieldNumber, 5)
    const buf = Buffer.allocUnsafe(4)
    buf.writeFloatLE(value, 0)
    this._chunks.push(buf)
  }

  finish(): Buffer {
    return Buffer.concat(this._chunks)
  }
}

