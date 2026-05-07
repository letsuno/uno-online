function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function safeGet(obj: unknown, key: string): unknown {
  try {
    return (obj as any)?.[key]
  } catch {
    return undefined
  }
}

export function errorSummary(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error'
  if (typeof err === 'string') return err
  if (typeof err === 'number' || typeof err === 'boolean') return String(err)
  if (err && typeof err === 'object') {
    const msg = safeGet(err, 'message')
    if (typeof msg === 'string' && msg.trim()) return msg
    const code = safeGet(err, 'code')
    if (typeof code === 'string' && code.trim()) return code
  }
  return String(err)
}

export function makeJsonSafe(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null) return value
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return value.toString()
  if (t === 'symbol') return value.toString()
  if (t === 'function') return `[function ${(value as any).name || 'anonymous'}]`

  if (value instanceof Error) {
    return serializeError(value, depth, seen)
  }

  if (Buffer.isBuffer(value)) {
    return `[buffer ${value.length} bytes]`
  }

  if (value instanceof ArrayBuffer) {
    return `[arraybuffer ${value.byteLength} bytes]`
  }

  if (ArrayBuffer.isView(value)) {
    return `[typedarray ${(value as ArrayBufferView).byteLength} bytes]`
  }

  if (Array.isArray(value)) {
    if (depth >= 6) return `[array(${value.length})]`
    return value.map((v) => makeJsonSafe(v, depth + 1, seen))
  }

  if (value instanceof Map) {
    if (depth >= 6) return `[map(${value.size})]`
    const out: Record<string, unknown> = {}
    for (const [k, v] of value.entries()) {
      out[String(k)] = makeJsonSafe(v, depth + 1, seen)
    }
    return out
  }

  if (value instanceof Set) {
    if (depth >= 6) return `[set(${value.size})]`
    return [...value].map((v) => makeJsonSafe(v, depth + 1, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]'
    seen.add(value)

    if (depth >= 6) return '[object]'

    const out: Record<string, unknown> = {}
    const entries = isPlainObject(value) ? Object.entries(value) : Object.entries(value as any)
    for (const [k, v] of entries) {
      out[k] = makeJsonSafe(v, depth + 1, seen)
    }
    return out
  }

  return String(value)
}

export function serializeError(err: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (!(err instanceof Error)) return makeJsonSafe(err, depth, seen)

  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack
  }

  const code = safeGet(err, 'code')
  if (typeof code === 'string') out.code = code
  const errno = safeGet(err, 'errno')
  if (typeof errno === 'number') out.errno = errno
  const syscall = safeGet(err, 'syscall')
  if (typeof syscall === 'string') out.syscall = syscall
  const address = safeGet(err, 'address')
  if (typeof address === 'string') out.address = address
  const port = safeGet(err, 'port')
  if (typeof port === 'number') out.port = port
  const host = safeGet(err, 'host')
  if (typeof host === 'string') out.host = host

  const cause = safeGet(err, 'cause')
  if (cause != null) out.cause = makeJsonSafe(cause, depth + 1, seen)

  return out
}

