import type {
  GatewaySetState,
  GatewayGetState,
  VoiceUserState,
  ChannelState,
  UserState,
  Metrics,
} from './gateway-types'

function safeParseJson(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export function createMessageHandler(
  set: GatewaySetState,
  get: GatewayGetState,
  voiceByUser: Map<number, VoiceUserState>,
): (ev: MessageEvent) => void {
  return (ev: MessageEvent) => {
    if (ev.data instanceof ArrayBuffer) {
      const buf = ev.data
      const view = new DataView(buf)
      if (view.byteLength < 1) return
      const kind = view.getUint8(0)
      if (kind !== 0x11) return

      if (view.byteLength < 11) return
      const userId = view.getUint32(1, true)
      const target = view.getUint8(5) & 0x1f
      const flags = view.getUint8(6)
      const isLastFrame = (flags & 0x01) !== 0
      const sequence = view.getUint32(7, true)
      const payloadOffset = 11
      if (payloadOffset > view.byteLength) return
      const payloadView = new Uint8Array(buf, payloadOffset)
      const opus = new Uint8Array(payloadView.byteLength)
      opus.set(payloadView)

      const now = nowMs()
      const st = voiceByUser.get(userId) ?? { jitterMs: 0, received: 0, missing: 0, outOfOrder: 0 }
      st.received += 1
      if (st.lastSeq != null) {
        const delta = (sequence - st.lastSeq) >>> 0
        if (delta === 0) {
          st.outOfOrder += 1
        } else if (delta > 1 && delta < 0x80000000) {
          st.missing += delta - 1
        } else if (delta >= 0x80000000) {
          st.outOfOrder += 1
        }
      }
      if (st.lastArrivalMs != null) {
        const d = Math.abs(now - st.lastArrivalMs - 20)
        st.jitterMs += (d - st.jitterMs) / 16
      }
      st.lastSeq = sequence
      st.lastArrivalMs = now
      voiceByUser.set(userId, st)

      const sink = get()._voiceSink
      if (sink) {
        sink({ userId, target, sequence, isLastFrame, opus })
      }
      return
    }

    if (typeof ev.data !== 'string') return
    const msg = safeParseJson(ev.data)
    if (!msg || typeof msg.type !== 'string') return

    switch (msg.type) {
      case 'serverList': {
        set({ servers: msg.servers ?? [] })
        return
      }
      case 'pong': {
        const sent = typeof msg.clientTimeMs === 'number' ? msg.clientTimeMs : null
        if (sent == null) return
        const rttMs = Math.round(Math.max(0, nowMs() - sent))
        if (!Number.isFinite(rttMs)) return
        if (get().metrics.wsRttMs === rttMs) return
        set((s) => ({
          metrics: {
            ...s.metrics,
            wsRttMs: rttMs,
          },
        }))
        return
      }
      case 'connected': {
        voiceByUser.clear()
        const sessionReconnectTimeout = get()._sessionReconnectTimeout
        if (sessionReconnectTimeout) window.clearTimeout(sessionReconnectTimeout)
        const current = get()
        set({
          status: 'connected',
          connectError: null,
          _connectedOnce: true,
          _sessionReconnectAttempt: 0,
          _sessionReconnectTimeout: null,
          selfUserId: msg.selfUserId ?? null,
          rootChannelId: msg.rootChannelId ?? null,
          selectedChannelId: current.selectedChannelId ?? msg.rootChannelId ?? null,
          speakingByUserId: {},
          selfSpeaking: false,
        })
        return
      }
      case 'disconnected': {
        voiceByUser.clear()
        const reason = typeof msg.reason === 'string' ? msg.reason : 'disconnected'
        const shouldReconnect = get()._connectedOnce && Boolean(get()._lastConnectArgs) && reason !== 'client_disconnect'

        const sessionReconnectTimeout = get()._sessionReconnectTimeout
        if (sessionReconnectTimeout) window.clearTimeout(sessionReconnectTimeout)

        set({
          status: shouldReconnect ? 'reconnecting' : 'idle',
          connectError: shouldReconnect ? `连接已断开（${reason}），正在重连…` : null,
          channelsById: {},
          usersById: {},
          speakingByUserId: {},
          selfSpeaking: false,
          rootChannelId: null,
          selfUserId: null,
          selectedChannelId: null,
          chat: [],
          metrics: {},
          playbackStats: null,
          captureStats: null,
          contextActions: [],
          permissionsByChannelId: {},
          mumbleServerConfig: {},
        })

        if (shouldReconnect) {
          const attempt = get()._sessionReconnectAttempt + 1
          const delayMs = Math.min(30_000, 1000 * 2 ** (attempt - 1))
          const id = window.setTimeout(() => {
            set({ _sessionReconnectTimeout: null })
            const args = get()._lastConnectArgs
            const currentWs = get()._ws
            if (!args || !currentWs || currentWs.readyState !== WebSocket.OPEN) return
            try {
              set({ status: 'connecting', connectError: null })
              currentWs.send(JSON.stringify({ type: 'connect', ...args }))
            } catch {
              set({ status: 'reconnecting', connectError: '重连失败，等待下一次重试…' })
            }
          }, delayMs)
          set({ _sessionReconnectAttempt: attempt, _sessionReconnectTimeout: id })
        }
        return
      }
      case 'stateSnapshot': {
        const channelsById: Record<number, ChannelState> = {}
        const usersById: Record<number, UserState> = {}

        for (const ch of msg.channels ?? []) {
          channelsById[ch.id] = { id: ch.id, name: ch.name ?? '', parentId: ch.parentId ?? null }
        }
        for (const u of msg.users ?? []) {
          const entry: UserState = { id: u.id, name: u.name ?? '', channelId: u.channelId ?? null }
          if (u.mute != null) entry.mute = u.mute
          if (u.deaf != null) entry.deaf = u.deaf
          if (u.suppress != null) entry.suppress = u.suppress
          if (u.selfMute != null) entry.selfMute = u.selfMute
          if (u.selfDeaf != null) entry.selfDeaf = u.selfDeaf
          if (u.texture != null) entry.texture = u.texture
          if (u.listeningChannelIds != null && u.listeningChannelIds.length > 0) entry.listeningChannelIds = u.listeningChannelIds
          usersById[u.id] = entry
        }

        const current = get()
        const selfUser = current.selfUserId != null ? usersById[current.selfUserId] : undefined
        const selfChannelId = selfUser?.channelId ?? null

        let selectedChannelId = current.selectedChannelId
        const shouldAutoSelectSelf =
          selectedChannelId == null || (current.rootChannelId != null && selectedChannelId === current.rootChannelId)

        if (shouldAutoSelectSelf && selfChannelId != null) {
          selectedChannelId = selfChannelId
        }

        if (selectedChannelId != null && !channelsById[selectedChannelId]) {
          selectedChannelId = null
        }

        if (selectedChannelId == null && current.rootChannelId != null && channelsById[current.rootChannelId]) {
          selectedChannelId = current.rootChannelId
        }

        if (selectedChannelId == null) {
          const first = (msg.channels ?? [])[0]
          selectedChannelId = first?.id ?? null
        }

        set({ channelsById, usersById, selectedChannelId })
        return
      }
      case 'channelUpsert': {
        const ch = msg.channel
        if (!ch) return
        set((s) => ({
          channelsById: {
            ...s.channelsById,
            [ch.id]: { id: ch.id, name: ch.name ?? '', parentId: ch.parentId ?? null },
          },
        }))
        return
      }
      case 'channelRemove': {
        const id = msg.channelId
        if (typeof id !== 'number') return
        set((s) => {
          const next = { ...s.channelsById }
          delete next[id]
          return { channelsById: next }
        })
        return
      }
      case 'userUpsert': {
        const u = msg.user
        if (!u) return
        set((s) => {
          const prev = s.usersById[u.id]
          const next: UserState = {
            id: u.id,
            name: u.name ?? prev?.name ?? '',
            channelId: u.channelId ?? prev?.channelId ?? null,
          }
          const mute = u.mute ?? prev?.mute
          const deaf = u.deaf ?? prev?.deaf
          const suppress = u.suppress ?? prev?.suppress
          const selfMute = u.selfMute ?? prev?.selfMute
          const selfDeaf = u.selfDeaf ?? prev?.selfDeaf
          if (mute != null) next.mute = mute
          if (deaf != null) next.deaf = deaf
          if (suppress != null) next.suppress = suppress
          if (selfMute != null) next.selfMute = selfMute
          if (selfDeaf != null) next.selfDeaf = selfDeaf
          const texture = u.texture ?? prev?.texture
          if (texture != null) next.texture = texture
          const listeningChannelIds = u.listeningChannelIds ?? prev?.listeningChannelIds
          if (listeningChannelIds != null && listeningChannelIds.length > 0) next.listeningChannelIds = listeningChannelIds
          return {
            usersById: { ...s.usersById, [u.id]: next },
          }
        })
        return
      }
      case 'userRemove': {
        const id = msg.userId
        if (typeof id !== 'number') return
        set((s) => {
          const next = { ...s.usersById }
          delete next[id]
          const nextSpeaking = { ...s.speakingByUserId }
          delete nextSpeaking[id]
          return { usersById: next, speakingByUserId: nextSpeaking }
        })
        return
      }
      case 'textRecv': {
        const senderId = typeof msg.senderId === 'number' ? msg.senderId : 0
        const message = typeof msg.message === 'string' ? msg.message : ''
        const timestampMs = typeof msg.timestampMs === 'number' ? msg.timestampMs : Date.now()
        const id = `${timestampMs}-${Math.random().toString(16).slice(2)}`
        const selfUserId = get().selfUserId
        if (
          selfUserId != null &&
          senderId === selfUserId &&
          get().chat.some(
            (c) => c.senderId === senderId && c.message === message && Math.abs(c.timestampMs - timestampMs) < 2000
          )
        ) {
          return
        }
        set((s) => ({ chat: [...s.chat, { id, senderId, message, timestampMs }].slice(-200) }))
        return
      }
      case 'metrics': {
        const update: Record<string, unknown> = {
          serverRttMs: msg.serverRttMs,
          wsBufferedAmountBytes: msg.wsBufferedAmountBytes,
          voiceDownlinkFramesTotal: msg.voiceDownlinkFramesTotal,
          voiceDownlinkBytesTotal: msg.voiceDownlinkBytesTotal,
          voiceDownlinkDroppedFramesTotal: msg.voiceDownlinkDroppedFramesTotal,
          voiceUplinkFramesTotal: msg.voiceUplinkFramesTotal,
          voiceUplinkBytesTotal: msg.voiceUplinkBytesTotal,
          voiceUplinkPacerQueueFrames: msg.voiceUplinkPacerQueueFrames,
          voiceUplinkPacerQueueMs: msg.voiceUplinkPacerQueueMs,
          voiceUplinkPacerDroppedFramesTotal: msg.voiceUplinkPacerDroppedFramesTotal,
          voiceDownlinkFps: msg.voiceDownlinkFps,
          voiceDownlinkKbps: msg.voiceDownlinkKbps,
          voiceDownlinkDroppedFps: msg.voiceDownlinkDroppedFps,
          voiceUplinkFps: msg.voiceUplinkFps,
          voiceUplinkKbps: msg.voiceUplinkKbps,
        }
        const prev = get().metrics as Record<string, unknown>
        let changed = false
        for (const k of Object.keys(update)) {
          if (prev[k] !== update[k]) { changed = true; break }
        }
        if (!changed) return
        set((s) => ({
          metrics: { ...s.metrics, ...update } as Metrics,
        }))
        return
      }
      case 'contextActionModify': {
        const action = typeof msg.action === 'string' ? msg.action : ''
        const text = typeof msg.text === 'string' ? msg.text : ''
        const context = typeof msg.context === 'number' ? msg.context : 0
        const operation = typeof msg.operation === 'number' ? msg.operation : 0

        if (operation === 1) {
          set((s) => ({
            contextActions: s.contextActions.filter((a) => a.action !== action),
          }))
        } else {
          set((s) => ({
            contextActions: [
              ...s.contextActions.filter((a) => a.action !== action),
              { action, text, context },
            ],
          }))
        }
        return
      }
      case 'permissionQuery': {
        const channelId = typeof msg.channelId === 'number' ? msg.channelId : null
        const permissions = typeof msg.permissions === 'number' ? msg.permissions : null
        const flush = msg.flush === true

        if (flush) {
          if (channelId != null && permissions != null) {
            set({ permissionsByChannelId: { [channelId]: permissions } })
          } else {
            set({ permissionsByChannelId: {} })
          }
        } else if (channelId != null && permissions != null) {
          set((s) => ({
            permissionsByChannelId: { ...s.permissionsByChannelId, [channelId]: permissions },
          }))
        }
        return
      }
      case 'serverConfig': {
        set((s) => {
          const next = { ...s.mumbleServerConfig }
          if (msg.maxBandwidth != null) next.maxBandwidth = msg.maxBandwidth
          if (msg.welcomeText != null) next.welcomeText = msg.welcomeText
          if (msg.allowHtml != null) next.allowHtml = msg.allowHtml
          if (msg.messageLength != null) next.messageLength = msg.messageLength
          if (msg.imageMessageLength != null) next.imageMessageLength = msg.imageMessageLength
          if (msg.maxUsers != null) next.maxUsers = msg.maxUsers
          if (msg.recordingAllowed != null) next.recordingAllowed = msg.recordingAllowed
          return { mumbleServerConfig: next }
        })
        return
      }
      case 'error': {
        const code = typeof msg.code === 'string' ? msg.code : 'error'
        const message = typeof msg.message === 'string' ? msg.message : 'Unknown error'
        const pretty = `[${code}] ${message}`
        if (msg.details != null) {
          // eslint-disable-next-line no-console
          console.warn('[gateway error details]', msg.details)
        }

        if (get().status === 'connecting') {
          set({ status: 'error', connectError: pretty })
          return
        }

        const timestampMs = Date.now()
        const id = `${timestampMs}-system-${Math.random().toString(16).slice(2)}`
        set((s) => ({
          connectError: pretty,
          chat: [...s.chat, { id, senderId: 0, message: pretty, timestampMs }].slice(-200),
        }))
        return
      }
    }
  }
}
