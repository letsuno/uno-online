import selfsigned from 'selfsigned'

let cached: { cert: string; key: string } | null = null

// Mumble servers with certrequired=true reject connections without a client cert.
// A self-signed cert is sufficient — the server checks presence, not CA chain.
export async function getGatewayCert(): Promise<{ cert: string; key: string }> {
  if (cached) return cached

  const notAfter = new Date()
  notAfter.setFullYear(notAfter.getFullYear() + 10)

  const attrs = [{ name: 'commonName', value: 'mumble-web-gateway' }]
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter
  })

  cached = { cert: pems.cert, key: pems.private }
  return cached
}
