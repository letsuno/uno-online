import type { GatewayGetState, GatewaySetState } from './gateway-types'

export type UplinkState = {
  queue: Array<ArrayBuffer>
  pacerId: number | null
  droppedTotal: number
  lastStatsAtMs: number
}

export type UplinkController = {
  uplink: UplinkState
  updateUplinkStats: (force?: boolean) => void
  startUplinkPacer: () => void
  stopUplinkPacer: () => void
}

export function createUplinkController(set: GatewaySetState, get: GatewayGetState): UplinkController {
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  const uplink: UplinkState = {
    queue: [],
    pacerId: null,
    droppedTotal: 0,
    lastStatsAtMs: 0,
  }

  const updateUplinkStats = (force = false) => {
    const now = nowMs()
    if (!force && now - uplink.lastStatsAtMs < 200) return
    uplink.lastStatsAtMs = now

    const ws = get()._ws
    const newQueue = uplink.queue.length
    const newDropped = uplink.droppedTotal
    const newBuffered = ws && ws.readyState === WebSocket.OPEN ? ws.bufferedAmount : 0

    const prev = get().metrics
    if (
      prev.uplinkQueueFrames === newQueue &&
      prev.uplinkDroppedFramesTotal === newDropped &&
      prev.uplinkClientBufferedAmountBytes === newBuffered
    ) return

    set((s) => ({
      metrics: {
        ...s.metrics,
        uplinkQueueFrames: newQueue,
        uplinkDroppedFramesTotal: newDropped,
        uplinkClientBufferedAmountBytes: newBuffered,
      },
    }))
  }

  const stopUplinkPacer = () => {
    if (uplink.pacerId != null) {
      window.clearInterval(uplink.pacerId)
      uplink.pacerId = null
    }
    uplink.queue.length = 0
    updateUplinkStats(true)
  }

  const startUplinkPacer = () => {
    if (uplink.pacerId != null) return
    uplink.pacerId = window.setInterval(() => {
      const ws = get()._ws
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        stopUplinkPacer()
        return
      }

      if (uplink.queue.length === 0) {
        stopUplinkPacer()
        return
      }

      const maxBuffered = get().uplinkMaxBufferedAmountBytes
      if (ws.bufferedAmount > maxBuffered) {
        // Network is congested; keep only the most recent frame to stay realtime.
        if (uplink.queue.length > 1) {
          uplink.droppedTotal += uplink.queue.length - 1
          uplink.queue.splice(0, uplink.queue.length - 1)
        }
        updateUplinkStats()
        return
      }

      // Catch up quickly after main-thread stalls by sending a small burst if possible.
      // This avoids dropping frames on otherwise good networks when encoder output comes in bursts.
      let sent = 0
      while (uplink.queue.length > 0 && sent < 5 && ws.bufferedAmount <= maxBuffered) {
        const next = uplink.queue.shift()
        if (!next) break
        try {
          ws.send(next)
        } catch {
          uplink.droppedTotal += 1
        }
        sent += 1
      }
      updateUplinkStats()
    }, 20)
  }

  return { uplink, updateUplinkStats, startUplinkPacer, stopUplinkPacer }
}
