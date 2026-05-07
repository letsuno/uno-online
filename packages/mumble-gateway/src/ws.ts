import type WebSocket from 'ws'
import type { GatewayServerMessage } from './types.js'
import { makeJsonSafe } from './error-utils.js'

export function sendJson(ws: WebSocket, msg: GatewayServerMessage): void {
  if (ws.readyState !== ws.OPEN) return
  try {
    ws.send(JSON.stringify(makeJsonSafe(msg)))
  } catch (err) {
    try {
      ws.send(
        JSON.stringify({
          type: 'error',
          code: 'internal_error',
          message: 'Failed to serialize gateway message',
          details: makeJsonSafe(err)
        })
      )
    } catch {}
  }
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
