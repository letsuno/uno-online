import dgram from 'node:dgram'
import { Duplex } from 'node:stream'

export function createUdpVoiceStream(params: { host: string; port: number }): Duplex {
  const { host, port } = params
  const socket = dgram.createSocket('udp4')

  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      socket.send(buf, (err) => callback(err ?? undefined))
    },
    final(callback) {
      try {
        socket.close()
      } catch {}
      callback()
    }
  })

  socket.on('message', (msg) => {
    stream.push(msg)
  })
  socket.on('error', (err) => {
    stream.destroy(err)
  })
  socket.on('close', () => {
    stream.push(null)
  })

  socket.connect(port, host)

  stream.on('close', () => {
    try {
      socket.close()
    } catch {}
  })

  return stream
}

