import { createCipheriv, createDecipheriv } from 'node:crypto'

const AES_BLOCK_SIZE = 16
const AES_KEY_SIZE_BYTES = 16

export type PacketStats = {
  good: number
  late: number
  lost: number
  resync: number
}

function zeroBlock(): Buffer {
  return Buffer.alloc(AES_BLOCK_SIZE, 0)
}

function xorInto(dst: Uint8Array, a: Uint8Array, b: Uint8Array): void {
  for (let i = 0; i < AES_BLOCK_SIZE; i++) dst[i] = (a[i]! ^ b[i]!) & 0xff
}

function xorInPlace(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < AES_BLOCK_SIZE; i++) dst[i] = (dst[i]! ^ src[i]!) & 0xff
}

// GF(2^128) doubling on a 16-byte block (big-endian bit order).
function s2(block: Uint8Array): void {
  let carry = 0
  for (let i = AES_BLOCK_SIZE - 1; i >= 0; i--) {
    const b = block[i]!
    const nextCarry = (b & 0x80) !== 0 ? 1 : 0
    block[i] = ((b << 1) & 0xff) | carry
    carry = nextCarry
  }
  if (carry) block[AES_BLOCK_SIZE - 1] = (block[AES_BLOCK_SIZE - 1]! ^ 0x87) & 0xff
}

// GF(2^128) multiply-by-3: block = block XOR s2(block).
function s3(block: Uint8Array): void {
  const doubled = Buffer.from(block)
  s2(doubled)
  xorInPlace(block, doubled)
}

function aesEcbEncryptBlock(cipher: ReturnType<typeof createCipheriv>, block: Uint8Array): Buffer {
  // Node's Cipher is a streaming interface; ECB has no IV/state so update() is safe per-block.
  const out = cipher.update(block)
  if (out.length !== AES_BLOCK_SIZE) throw new Error('Unexpected AES block encrypt output size')
  return out
}

function aesEcbDecryptBlock(decipher: ReturnType<typeof createDecipheriv>, block: Uint8Array): Buffer {
  const out = decipher.update(block)
  if (out.length !== AES_BLOCK_SIZE) throw new Error('Unexpected AES block decrypt output size')
  return out
}

function ocbEncrypt(params: {
  key: Buffer
  nonce: Buffer
  plain: Buffer
  modifyPlainOnXexStarAttack: boolean
}): { encrypted: Buffer; tag: Buffer; success: boolean } {
  const { key, nonce, plain, modifyPlainOnXexStarAttack } = params

  const cipher = createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(false)

  let delta = aesEcbEncryptBlock(cipher, nonce)
  let checksum = zeroBlock()

  const encrypted = Buffer.allocUnsafe(plain.length)

  let remaining = plain.length
  let plainOffset = 0
  let encOffset = 0
  let success = true

  while (remaining > AES_BLOCK_SIZE) {
    let flipABit = false
    if (remaining - AES_BLOCK_SIZE <= AES_BLOCK_SIZE) {
      let sum = 0
      for (let i = 0; i < AES_BLOCK_SIZE - 1; i++) sum |= plain[plainOffset + i]!
      if (sum === 0) {
        if (modifyPlainOnXexStarAttack) {
          flipABit = true
        } else {
          success = false
        }
      }
    }

    s2(delta)

    const plainBlock = plain.subarray(plainOffset, plainOffset + AES_BLOCK_SIZE)

    const tmp = Buffer.allocUnsafe(AES_BLOCK_SIZE)
    xorInto(tmp, delta, plainBlock)
    if (flipABit) tmp[0] = (tmp[0]! ^ 1) & 0xff

    const tmpEnc = aesEcbEncryptBlock(cipher, tmp)

    const outBlock = Buffer.allocUnsafe(AES_BLOCK_SIZE)
    xorInto(outBlock, delta, tmpEnc)
    outBlock.copy(encrypted, encOffset)

    xorInPlace(checksum, plainBlock)
    if (flipABit) checksum[0] = (checksum[0]! ^ 1) & 0xff

    remaining -= AES_BLOCK_SIZE
    plainOffset += AES_BLOCK_SIZE
    encOffset += AES_BLOCK_SIZE
  }

  // Final (possibly partial) block
  s2(delta)

  const tmp = zeroBlock()
  tmp.writeBigUInt64BE(BigInt(remaining * 8), 8)
  xorInPlace(tmp, delta)

  const pad = aesEcbEncryptBlock(cipher, tmp)

  const full = Buffer.allocUnsafe(AES_BLOCK_SIZE)
  plain.copy(full, 0, plainOffset, plainOffset + remaining)
  pad.copy(full, remaining, remaining)

  xorInPlace(checksum, full)

  xorInto(full, pad, full)
  full.copy(encrypted, encOffset, 0, remaining)

  s3(delta)
  const tagTmp = Buffer.allocUnsafe(AES_BLOCK_SIZE)
  xorInto(tagTmp, delta, checksum)
  const tag = aesEcbEncryptBlock(cipher, tagTmp)

  const final = cipher.final()
  if (final.length) throw new Error('Unexpected AES final output (encrypt)')

  return { encrypted, tag, success }
}

function ocbDecrypt(params: { key: Buffer; nonce: Buffer; encrypted: Buffer }): { plain: Buffer; tag: Buffer; success: boolean } {
  const { key, nonce, encrypted } = params

  const cipher = createCipheriv('aes-128-ecb', key, null)
  cipher.setAutoPadding(false)
  const decipher = createDecipheriv('aes-128-ecb', key, null)
  decipher.setAutoPadding(false)

  let delta = aesEcbEncryptBlock(cipher, nonce)
  let checksum = zeroBlock()

  const plain = Buffer.allocUnsafe(encrypted.length)

  let remaining = encrypted.length
  let encOffset = 0
  let plainOffset = 0
  let success = true

  while (remaining > AES_BLOCK_SIZE) {
    s2(delta)

    const encBlock = encrypted.subarray(encOffset, encOffset + AES_BLOCK_SIZE)
    const tmp = Buffer.allocUnsafe(AES_BLOCK_SIZE)
    xorInto(tmp, delta, encBlock)

    const tmpDec = aesEcbDecryptBlock(decipher, tmp)

    const outBlock = Buffer.allocUnsafe(AES_BLOCK_SIZE)
    xorInto(outBlock, delta, tmpDec)
    outBlock.copy(plain, plainOffset)

    xorInPlace(checksum, outBlock)

    remaining -= AES_BLOCK_SIZE
    encOffset += AES_BLOCK_SIZE
    plainOffset += AES_BLOCK_SIZE
  }

  s2(delta)
  const tmp = zeroBlock()
  tmp.writeBigUInt64BE(BigInt(remaining * 8), 8)
  xorInPlace(tmp, delta)

  const pad = aesEcbEncryptBlock(cipher, tmp)

  const full = zeroBlock()
  encrypted.copy(full, 0, encOffset, encOffset + remaining)
  xorInPlace(full, pad)

  xorInPlace(checksum, full)
  full.copy(plain, plainOffset, 0, remaining)

  // XEX* attack detection (see mumble-server/src/crypto/CryptStateOCB2.cpp)
  if (full.subarray(0, AES_BLOCK_SIZE - 1).equals(delta.subarray(0, AES_BLOCK_SIZE - 1))) {
    success = false
  }

  s3(delta)
  const tagTmp = Buffer.allocUnsafe(AES_BLOCK_SIZE)
  xorInto(tagTmp, delta, checksum)
  const tag = aesEcbEncryptBlock(cipher, tagTmp)

  const finalEnc = cipher.final()
  if (finalEnc.length) throw new Error('Unexpected AES final output (decrypt-encrypt)')
  const finalDec = decipher.final()
  if (finalDec.length) throw new Error('Unexpected AES final output (decrypt-decrypt)')

  return { plain, tag, success }
}

export class CryptStateOCB2 {
  private _rawKey = Buffer.alloc(AES_KEY_SIZE_BYTES, 0)
  private _encryptIv = Buffer.alloc(AES_BLOCK_SIZE, 0)
  private _decryptIv = Buffer.alloc(AES_BLOCK_SIZE, 0)
  private _decryptHistory = new Uint8Array(0x100)
  private _init = false

  readonly statsLocal: PacketStats = { good: 0, late: 0, lost: 0, resync: 0 }
  readonly statsRemote: PacketStats = { good: 0, late: 0, lost: 0, resync: 0 }

  isValid(): boolean {
    return this._init
  }

  setKey(key: Buffer, clientNonce: Buffer, serverNonce: Buffer): boolean {
    if (key.length !== AES_KEY_SIZE_BYTES || clientNonce.length !== AES_BLOCK_SIZE || serverNonce.length !== AES_BLOCK_SIZE) {
      return false
    }
    key.copy(this._rawKey)
    clientNonce.copy(this._encryptIv)
    serverNonce.copy(this._decryptIv)
    this._decryptHistory.fill(0)
    this._init = true
    return true
  }

  setRawKey(key: Buffer): boolean {
    if (key.length !== AES_KEY_SIZE_BYTES) return false
    key.copy(this._rawKey)
    return true
  }

  setEncryptIV(iv: Buffer): boolean {
    if (iv.length !== AES_BLOCK_SIZE) return false
    iv.copy(this._encryptIv)
    return true
  }

  setDecryptIV(iv: Buffer): boolean {
    if (iv.length !== AES_BLOCK_SIZE) return false
    iv.copy(this._decryptIv)
    return true
  }

  getEncryptIV(): Buffer {
    return Buffer.from(this._encryptIv)
  }

  getDecryptIV(): Buffer {
    return Buffer.from(this._decryptIv)
  }

  encrypt(plain: Buffer): Buffer | null {
    if (!this._init) return null

    // First, increase our IV (little-endian).
    for (let i = 0; i < AES_BLOCK_SIZE; i++) {
      const next = (this._encryptIv[i]! + 1) & 0xff
      this._encryptIv[i] = next
      if (next !== 0) break
    }

    const { encrypted, tag, success } = ocbEncrypt({
      key: this._rawKey,
      nonce: this._encryptIv,
      plain,
      modifyPlainOnXexStarAttack: true
    })
    if (!success) return null

    const out = Buffer.allocUnsafe(encrypted.length + 4)
    out[0] = this._encryptIv[0]!
    out[1] = tag[0]!
    out[2] = tag[1]!
    out[3] = tag[2]!
    encrypted.copy(out, 4)
    return out
  }

  decrypt(source: Buffer): Buffer | null {
    if (!this._init) return null
    if (source.length < 4) return null

    const plainLength = source.length - 4

    const saveIv = Buffer.from(this._decryptIv)
    const ivByte = source[0]!
    let restore = false

    let lost = 0
    let late = 0

    if (((this._decryptIv[0]! + 1) & 0xff) === ivByte) {
      // In order as expected.
      if (ivByte > this._decryptIv[0]!) {
        this._decryptIv[0] = ivByte
      } else if (ivByte < this._decryptIv[0]!) {
        this._decryptIv[0] = ivByte
        for (let i = 1; i < AES_BLOCK_SIZE; i++) {
          const next = (this._decryptIv[i]! + 1) & 0xff
          this._decryptIv[i] = next
          if (next !== 0) break
        }
      } else {
        return null
      }
    } else {
      // This is either out of order or a repeat.
      let diff = ivByte - this._decryptIv[0]!
      if (diff > 128) diff -= 256
      else if (diff < -128) diff += 256

      if (ivByte < this._decryptIv[0]! && diff > -30 && diff < 0) {
        // Late packet, but no wraparound.
        late = 1
        lost = -1
        this._decryptIv[0] = ivByte
        restore = true
      } else if (ivByte > this._decryptIv[0]! && diff > -30 && diff < 0) {
        // Last was 0x02, here comes 0xff from last round
        late = 1
        lost = -1
        this._decryptIv[0] = ivByte
        for (let i = 1; i < AES_BLOCK_SIZE; i++) {
          const prev = this._decryptIv[i]!
          this._decryptIv[i] = (prev - 1) & 0xff
          if (prev !== 0) break
        }
        restore = true
      } else if (ivByte > this._decryptIv[0]! && diff > 0) {
        // Lost a few packets, but beyond that we're good.
        lost = ivByte - this._decryptIv[0]! - 1
        this._decryptIv[0] = ivByte
      } else if (ivByte < this._decryptIv[0]! && diff > 0) {
        // Lost a few packets, and wrapped around
        lost = 256 - this._decryptIv[0]! + ivByte - 1
        this._decryptIv[0] = ivByte
        for (let i = 1; i < AES_BLOCK_SIZE; i++) {
          const next = (this._decryptIv[i]! + 1) & 0xff
          this._decryptIv[i] = next
          if (next !== 0) break
        }
      } else {
        return null
      }

      if (this._decryptHistory[this._decryptIv[0]!] === this._decryptIv[1]!) {
        this._decryptIv = saveIv
        return null
      }
    }

    const { plain, tag, success } = ocbDecrypt({
      key: this._rawKey,
      nonce: this._decryptIv,
      encrypted: source.subarray(4)
    })

    if (!success || tag[0] !== source[1] || tag[1] !== source[2] || tag[2] !== source[3]) {
      this._decryptIv = saveIv
      return null
    }

    this._decryptHistory[this._decryptIv[0]!] = this._decryptIv[1]!

    if (restore) this._decryptIv = saveIv

    this.statsLocal.good += 1

    if (late > 0) {
      this.statsLocal.late += late
    } else if (this.statsLocal.late > Math.abs(late)) {
      this.statsLocal.late -= Math.abs(late)
    }

    if (lost > 0) {
      this.statsLocal.lost += lost
    } else if (this.statsLocal.lost > Math.abs(lost)) {
      this.statsLocal.lost -= Math.abs(lost)
    }

    return plain.subarray(0, plainLength)
  }
}

