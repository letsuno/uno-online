import type { GatewaySetState, GatewayGetState, VoiceUserState } from './gateway-types'

export function createVoiceStatsInterval(
  set: GatewaySetState,
  get: GatewayGetState,
  voiceByUser: Map<number, VoiceUserState>,
): number {
  return window.setInterval(() => {
    if (get().status !== 'connected') return
    let maxJitterMs = 0
    let missing = 0
    let outOfOrder = 0

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const speakingUpdate: Record<number, boolean> = { ...get().speakingByUserId }
    let speakingChanged = false

    // Clean up old speaking states
    for (const uid of Object.keys(speakingUpdate)) {
      const uNum = Number(uid)
      if (!voiceByUser.has(uNum)) {
        if (speakingUpdate[uNum]) {
          speakingUpdate[uNum] = false
          speakingChanged = true
        }
      }
    }

    for (const [userId, st] of voiceByUser.entries()) {
      if (st.jitterMs > maxJitterMs) maxJitterMs = st.jitterMs
      missing += st.missing
      outOfOrder += st.outOfOrder

      // Check active speaker (received frame within last 300ms)
      const isSpeaking = st.lastArrivalMs != null && now - st.lastArrivalMs < 300
      if (speakingUpdate[userId] !== isSpeaking) {
        speakingUpdate[userId] = isSpeaking
        speakingChanged = true
      }
    }

    const jitterVal = maxJitterMs ? Math.round(maxJitterMs * 10) / 10 : 0
    const prev = get().metrics
    const metricsChanged =
      prev.voiceDownlinkJitterMs !== jitterVal ||
      prev.voiceDownlinkMissingFramesTotal !== missing ||
      prev.voiceDownlinkOutOfOrderFramesTotal !== outOfOrder

    if (!metricsChanged && !speakingChanged) return

    set((s) => ({
      ...(metricsChanged ? {
        metrics: {
          ...s.metrics,
          voiceDownlinkJitterMs: jitterVal,
          voiceDownlinkMissingFramesTotal: missing,
          voiceDownlinkOutOfOrderFramesTotal: outOfOrder,
        },
      } : {}),
      ...(speakingChanged ? { speakingByUserId: speakingUpdate } : {}),
    }))
  }, 100)
}
