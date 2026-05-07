const enabled = process.env.GATEWAY_DEBUG === '1' || process.env.GATEWAY_DEBUG === 'true'

export function debugLog(...args: any[]): void {
  if (!enabled) return
  // eslint-disable-next-line no-console
  console.log(...args)
}

export function debugError(...args: any[]): void {
  if (!enabled) return
  // eslint-disable-next-line no-console
  console.error(...args)
}

