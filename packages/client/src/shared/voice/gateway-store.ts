import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type ServerListEntry = { id: string; name: string }

type ChannelState = {
  id: number
  name: string
  parentId: number | null
}

type UserState = {
  id: number
  name: string
  channelId: number | null
  mute?: boolean
  deaf?: boolean
  suppress?: boolean
  selfMute?: boolean
  selfDeaf?: boolean
  texture?: string
  listeningChannelIds?: number[]
}

type ChatItem = {
  id: string
  senderId: number
  message: string
  timestampMs: number
}

export type PlaybackStats = {
  totalQueuedMs: number
  maxQueuedMs: number
  streams: number
}

export type CaptureStats = {
  rms: number
  sending: boolean
}

type Metrics = {
  wsRttMs?: number
  serverRttMs?: number
  wsBufferedAmountBytes?: number
  uplinkClientBufferedAmountBytes?: number
  uplinkQueueFrames?: number
  uplinkDroppedFramesTotal?: number
  voiceDownlinkFramesTotal?: number
  voiceDownlinkBytesTotal?: number
  voiceDownlinkDroppedFramesTotal?: number
  voiceUplinkFramesTotal?: number
  voiceUplinkBytesTotal?: number
  voiceUplinkPacerQueueFrames?: number
  voiceUplinkPacerQueueMs?: number
  voiceUplinkPacerDroppedFramesTotal?: number
  voiceDownlinkFps?: number
  voiceDownlinkKbps?: number
  voiceDownlinkDroppedFps?: number
  voiceUplinkFps?: number
  voiceUplinkKbps?: number
  voiceDownlinkJitterMs?: number
  voiceDownlinkMissingFramesTotal?: number
  voiceDownlinkOutOfOrderFramesTotal?: number
}

type ContextAction = {
  action: string
  text: string
  context: number
}

type MumbleServerConfig = {
  maxBandwidth?: number
  welcomeText?: string
  allowHtml?: boolean
  messageLength?: number
  imageMessageLength?: number
  maxUsers?: number
  recordingAllowed?: boolean
}

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

type GatewayStatus = 'closed' | 'connecting' | 'open'

type VoiceOpusFrame = {
  userId: number
  target: number
  sequence: number
  isLastFrame: boolean
  opus: Uint8Array
}

type VoiceMode = 'vad' | 'ptt'

export type PlayerVoicePresence = {
  inVoice: boolean
  micEnabled: boolean
  speakerMuted: boolean
  speaking: boolean
}

type SavedCredentials = {
  serverId: string
  username: string
  password: string
  tokens: string
}

type GatewayStore = {
  gatewayStatus: GatewayStatus
  status: Status
  connectError: string | null
  servers: ServerListEntry[]

  rememberCredentials: boolean
  savedCredentials: SavedCredentials | null

  channelsById: Record<number, ChannelState>
  usersById: Record<number, UserState>
  speakingByUserId: Record<number, boolean>
  playerVoicePresence: Record<string, PlayerVoicePresence>
  selfSpeaking: boolean
  micEnabled: boolean
  speakerMuted: boolean
  rootChannelId: number | null
  selfUserId: number | null

  selectedChannelId: number | null
  chat: ChatItem[]
  metrics: Metrics
  playbackStats: PlaybackStats | null
  captureStats: CaptureStats | null
  contextActions: ContextAction[]
  permissionsByChannelId: Record<number, number>
  mumbleServerConfig: MumbleServerConfig

  // Audio settings (persisted)
  voiceMode: VoiceMode
  pttKey: string
  vadThreshold: number
  vadHoldTimeMs: number
  opusBitrate: number
  uplinkCongestionControlEnabled: boolean
  uplinkMaxBufferedAmountBytes: number

  // Mic settings (persisted)
  micEchoCancellation: boolean
  micNoiseSuppression: boolean
  micAutoGainControl: boolean
  rnnoiseEnabled: boolean
  selectedInputDeviceId: string | null

  _ws: WebSocket | null
  _pingInterval: number | null
  _voiceSink: ((frame: VoiceOpusFrame) => void) | null
  _lastConnectArgs: { serverId: string; username: string; password?: string; tokens?: string[] } | null
  _connectedOnce: boolean
  _reconnectAttempt: number
  _reconnectTimeout: number | null
  _sessionReconnectAttempt: number
  _sessionReconnectTimeout: number | null

  init: () => void
  disconnect: () => void
  connect: (args: { serverId: string; username: string; password?: string; tokens?: string[] }) => void
  clearError: () => void
  setVoiceSink: (sink: ((frame: VoiceOpusFrame) => void) | null) => void
  sendMicOpus: (opus: Uint8Array, params?: { target?: number }) => void
  sendMicEnd: () => void
  setPlayerVoicePresence: (presence: Record<string, PlayerVoicePresence>) => void
  upsertPlayerVoicePresence: (userId: string, presence: PlayerVoicePresence) => void
  clearPlayerVoicePresence: () => void
  selectChannel: (channelId: number) => void
  joinSelectedChannel: () => void
  listenChannel: (channelId: number) => void
  unlistenChannel: (channelId: number) => void
  sendTextToSelectedChannel: (message: string) => void
  setVoiceMode: (mode: VoiceMode) => void
  setPttKey: (key: string) => void
  setVadThreshold: (val: number) => void
  setVadHoldTimeMs: (val: number) => void
  setOpusBitrate: (bitrate: number) => void
  setUplinkCongestionControlEnabled: (enabled: boolean) => void
  setUplinkMaxBufferedAmountBytes: (bytes: number) => void
  setMicEchoCancellation: (val: boolean) => void
  setMicNoiseSuppression: (val: boolean) => void
  setMicAutoGainControl: (val: boolean) => void
  setRnnoiseEnabled: (val: boolean) => void
  setSelectedInputDeviceId: (deviceId: string | null) => void
  setPlaybackStats: (stats: PlaybackStats | null) => void
  setCaptureStats: (stats: CaptureStats | null) => void
  setSelfSpeaking: (speaking: boolean) => void
  setMicEnabled: (enabled: boolean) => void
  setSpeakerMuted: (muted: boolean) => void
  setRememberCredentials: (val: boolean) => void
  setSavedCredentials: (creds: SavedCredentials | null) => void
}

function getGatewayUrl(): string {
  const explicit = import.meta.env.VITE_MUMBLE_GATEWAY_WS_URL
  if (explicit) return explicit

  if (import.meta.env.DEV) return 'ws://localhost:64737/ws'

  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/mumble-ws`
  }

  return 'ws://localhost:64737/ws'
}

function safeParseJson(text: string): any | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const useGatewayStore = create<GatewayStore>()(
  persist(
    (set, get) => {
      const uplink = {
        queue: [] as Array<ArrayBuffer>,
        pacerId: null as number | null,
        droppedTotal: 0,
        lastStatsAtMs: 0,
      }

      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

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

      return {
      gatewayStatus: 'closed',
      status: 'idle',
      connectError: null,
      servers: [],

      rememberCredentials: true,
      savedCredentials: null,

      channelsById: {},
      usersById: {},
      speakingByUserId: {},
      playerVoicePresence: {},
      selfSpeaking: false,
      micEnabled: false,
      speakerMuted: false,
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

      voiceMode: 'vad',
      pttKey: ' ',
      vadThreshold: 0.02,
      vadHoldTimeMs: 200,
      opusBitrate: 24000,
      uplinkCongestionControlEnabled: true,
      uplinkMaxBufferedAmountBytes: 256 * 1024,

      micEchoCancellation: true,
      micNoiseSuppression: true,
      micAutoGainControl: true,
      rnnoiseEnabled: false,
      selectedInputDeviceId: null,

      _ws: null,
      _pingInterval: null,
      _voiceSink: null,
      _lastConnectArgs: null,
      _connectedOnce: false,
      _reconnectAttempt: 0,
      _reconnectTimeout: null,
      _sessionReconnectAttempt: 0,
      _sessionReconnectTimeout: null,

      init: () => {
        const existing = get()._ws
        if (existing) return

        const voiceByUser = new Map<
          number,
          {
            lastSeq?: number
            lastArrivalMs?: number
            jitterMs: number
            received: number
            missing: number
            outOfOrder: number
          }
        >()

        let voiceStatsInterval: number | null = null

        const ws = new WebSocket(getGatewayUrl())
        ws.binaryType = 'arraybuffer'
        set({ _ws: ws, gatewayStatus: 'connecting', status: 'idle', connectError: null })

        ws.onopen = () => {
          const reconnectTimeout = get()._reconnectTimeout
          if (reconnectTimeout) window.clearTimeout(reconnectTimeout)
          set({ gatewayStatus: 'open', _reconnectAttempt: 0, _reconnectTimeout: null })

          // Start ping for ws RTT measurement
          const id = window.setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: 'ping', clientTimeMs: nowMs() }))
            } catch {}
          }, 2000)
          set({ _pingInterval: id })

          voiceStatsInterval = window.setInterval(() => {
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

          // Auto-reconnect if we have persisted credentials
          const auto = get()._lastConnectArgs
          if (auto) {
            set({ status: 'reconnecting', connectError: null })
            setTimeout(() => {
              const currentWs = get()._ws
              if (currentWs && currentWs.readyState === WebSocket.OPEN) {
                try {
                  currentWs.send(JSON.stringify({ type: 'connect', ...auto }))
                  set({ status: 'connecting' })
                } catch {}
              }
            }, 100)
          }
        }

        ws.onmessage = (ev) => {
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

            const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
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
              const d = Math.abs(nowMs - st.lastArrivalMs - 20)
              st.jitterMs += (d - st.jitterMs) / 16
            }
            st.lastSeq = sequence
            st.lastArrivalMs = nowMs
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

        ws.onclose = () => {
          stopUplinkPacer()

          const pingId = get()._pingInterval
          if (pingId) window.clearInterval(pingId)
          if (voiceStatsInterval) window.clearInterval(voiceStatsInterval)

          const sessionReconnectTimeout = get()._sessionReconnectTimeout
          if (sessionReconnectTimeout) window.clearTimeout(sessionReconnectTimeout)

          const attempt = get()._reconnectAttempt + 1
          const delayMs = Math.min(30_000, 500 * 2 ** (attempt - 1))
          const id = window.setTimeout(() => {
            set({ _reconnectTimeout: null })
            get().init()
          }, delayMs)

          set({
            _ws: null,
            _pingInterval: null,
            _voiceSink: null,
            gatewayStatus: 'closed',
            status: get()._lastConnectArgs ? 'reconnecting' : 'idle',
            connectError: get()._lastConnectArgs ? 'Gateway 连接已断开，正在重连…' : null,
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
            _reconnectAttempt: attempt,
            _reconnectTimeout: id,
            _sessionReconnectAttempt: 0,
            _sessionReconnectTimeout: null,
          })
        }
      },

      disconnect: () => {
        stopUplinkPacer()

        const reconnectTimeout = get()._reconnectTimeout
        if (reconnectTimeout) window.clearTimeout(reconnectTimeout)
        const sessionReconnectTimeout = get()._sessionReconnectTimeout
        if (sessionReconnectTimeout) window.clearTimeout(sessionReconnectTimeout)

        const ws = get()._ws
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'disconnect' }))
          } catch {}
        }
        set({
          status: 'idle',
          connectError: null,
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
          _lastConnectArgs: null,
          _connectedOnce: false,
          _reconnectAttempt: 0,
          _reconnectTimeout: null,
          _sessionReconnectAttempt: 0,
          _sessionReconnectTimeout: null,
        })
      },

      connect: (args) => {
        const ws = get()._ws
        set({ _lastConnectArgs: args, _connectedOnce: false })
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          set({ connectError: 'Gateway WebSocket not connected (will retry)', status: 'reconnecting' })
          get().init()
          return
        }
        set({ status: 'connecting', connectError: null })
        try {
          ws.send(JSON.stringify({ type: 'connect', ...args }))
        } catch {
          set({ status: 'reconnecting', connectError: 'Failed to send connect() (will retry)' })
        }
      },

      clearError: () => set({ connectError: null }),

      setVoiceSink: (sink) => set({ _voiceSink: sink }),

      sendMicOpus: (opus, params) => {
        const ws = get()._ws
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        const target = params?.target ?? 0

        const headerBytes = 4
        const buffer = new ArrayBuffer(headerBytes + opus.byteLength)
        const view = new DataView(buffer)
        view.setUint8(0, 0x12)
        view.setUint8(1, target & 0xff)
        view.setUint8(2, 0)
        view.setUint8(3, 0)
        new Uint8Array(buffer, headerBytes).set(opus)

        if (!get().uplinkCongestionControlEnabled) {
          try {
            ws.send(buffer)
          } catch {}
          return
        }

        // Fast path: on healthy connections, send immediately (no pacing/queue).
        // We only enter pacing mode once we observe backpressure.
        const maxBuffered = get().uplinkMaxBufferedAmountBytes
        if (uplink.queue.length === 0 && uplink.pacerId == null && ws.bufferedAmount <= maxBuffered) {
          try {
            ws.send(buffer)
          } catch {}
          updateUplinkStats()
          return
        }

        // If the WS send buffer is already too large, drop stale queued frames and keep only the latest.
        if (ws.bufferedAmount > maxBuffered) {
          uplink.droppedTotal += uplink.queue.length
          uplink.queue.length = 0
          uplink.queue.push(buffer)
          startUplinkPacer()
          updateUplinkStats()
          return
        }

        uplink.queue.push(buffer)
        // Bound in-memory queue (realtime > completeness).
        if (uplink.queue.length > 10) {
          const drop = uplink.queue.length - 10
          uplink.droppedTotal += drop
          uplink.queue.splice(0, drop)
        }
        startUplinkPacer()
        updateUplinkStats()
      },

      sendMicEnd: () => {
        const ws = get()._ws
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        if (get().uplinkCongestionControlEnabled) {
          // Drop any unsent frames so "end" isn't delayed behind stale audio.
          uplink.droppedTotal += uplink.queue.length
          uplink.queue.length = 0
          stopUplinkPacer()
        }

        try {
          ws.send(new Uint8Array([0x03]).buffer)
        } catch {}
      },

      setPlayerVoicePresence: (presence) => set({ playerVoicePresence: presence }),
      upsertPlayerVoicePresence: (userId, presence) => set((s) => ({
        playerVoicePresence: { ...s.playerVoicePresence, [userId]: presence },
      })),
      clearPlayerVoicePresence: () => set({ playerVoicePresence: {} }),

      selectChannel: (channelId) => set({ selectedChannelId: channelId }),

      joinSelectedChannel: () => {
        const ws = get()._ws
        const channelId = get().selectedChannelId
        if (!ws || ws.readyState !== WebSocket.OPEN || channelId == null) return
        try {
          ws.send(JSON.stringify({ type: 'joinChannel', channelId }))
        } catch {}
      },

      listenChannel: (channelId: number) => {
        const ws = get()._ws
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        try {
          ws.send(JSON.stringify({ type: 'listenChannel', channelId }))
        } catch {}
      },

      unlistenChannel: (channelId: number) => {
        const ws = get()._ws
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        try {
          ws.send(JSON.stringify({ type: 'unlistenChannel', channelId }))
        } catch {}
      },

      sendTextToSelectedChannel: (message) => {
        const ws = get()._ws
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        const channelId = get().selectedChannelId ?? undefined
        try {
          ws.send(JSON.stringify({ type: 'textSend', channelId, message }))
        } catch {}

        const selfUserId = get().selfUserId
        const timestampMs = Date.now()
        const id = `${timestampMs}-local-${Math.random().toString(16).slice(2)}`
        set((s) => ({
          chat: [...s.chat, { id, senderId: selfUserId ?? 0, message, timestampMs }].slice(-200),
        }))
      },

      setVoiceMode: (mode) => set({ voiceMode: mode }),
      setPttKey: (key) => set({ pttKey: key }),
      setVadThreshold: (val) => set({ vadThreshold: val }),
      setVadHoldTimeMs: (val) => set({ vadHoldTimeMs: val }),
      setOpusBitrate: (bitrate) => set({ opusBitrate: bitrate }),
      setUplinkCongestionControlEnabled: (enabled) => set({ uplinkCongestionControlEnabled: enabled }),
      setUplinkMaxBufferedAmountBytes: (bytes) => set({ uplinkMaxBufferedAmountBytes: bytes }),
      setMicEchoCancellation: (val) => set({ micEchoCancellation: val }),
      setMicNoiseSuppression: (val) => set({ micNoiseSuppression: val }),
      setMicAutoGainControl: (val) => set({ micAutoGainControl: val }),
      setRnnoiseEnabled: (val) => set({ rnnoiseEnabled: val }),
      setSelectedInputDeviceId: (deviceId) => set({ selectedInputDeviceId: deviceId }),
      setPlaybackStats: (stats) => {
        const prev = get().playbackStats
        if (
          prev && stats &&
          Math.round(prev.totalQueuedMs) === Math.round(stats.totalQueuedMs) &&
          Math.round(prev.maxQueuedMs) === Math.round(stats.maxQueuedMs) &&
          prev.streams === stats.streams
        ) return
        set({ playbackStats: stats ? { totalQueuedMs: Math.round(stats.totalQueuedMs), maxQueuedMs: Math.round(stats.maxQueuedMs), streams: stats.streams } : null })
      },
      setCaptureStats: (stats) => {
        const sending = stats?.sending ?? false
        const rmsRounded = stats ? Math.round(stats.rms * 1000) / 1000 : 0
        const prev = get()
        const speakingChanged = prev.selfSpeaking !== sending
        const statsChanged = !prev.captureStats !== !stats ||
          (prev.captureStats && stats && (
            prev.captureStats.sending !== stats.sending ||
            Math.round(prev.captureStats.rms * 1000) !== Math.round(rmsRounded * 1000)
          ))
        if (!statsChanged && !speakingChanged) return
        set({
          ...(statsChanged ? { captureStats: stats ? { rms: rmsRounded, sending } : null } : {}),
          ...(speakingChanged ? { selfSpeaking: sending } : {}),
        })
      },
      setSelfSpeaking: (speaking) => set({ selfSpeaking: speaking }),
      setMicEnabled: (enabled) => set({ micEnabled: enabled }),
      setSpeakerMuted: (muted) => set({ speakerMuted: muted }),
      setRememberCredentials: (val) => {
        set({ rememberCredentials: val })
        if (!val) set({ savedCredentials: null })
      },
      setSavedCredentials: (creds) => set({ savedCredentials: creds }),
    }
    },
    {
      name: 'mumble-gateway-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        servers: state.servers,
        _lastConnectArgs: state._lastConnectArgs,
        rememberCredentials: state.rememberCredentials,
        savedCredentials: state.savedCredentials,
        voiceMode: state.voiceMode,
        pttKey: state.pttKey,
        vadThreshold: state.vadThreshold,
        vadHoldTimeMs: state.vadHoldTimeMs,
        opusBitrate: state.opusBitrate,
        uplinkCongestionControlEnabled: state.uplinkCongestionControlEnabled,
        uplinkMaxBufferedAmountBytes: state.uplinkMaxBufferedAmountBytes,
        micEchoCancellation: state.micEchoCancellation,
        micNoiseSuppression: state.micNoiseSuppression,
        micAutoGainControl: state.micAutoGainControl,
        rnnoiseEnabled: state.rnnoiseEnabled,
        selectedInputDeviceId: state.selectedInputDeviceId,
      }),
    }
  )
)
