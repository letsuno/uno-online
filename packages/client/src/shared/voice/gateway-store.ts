import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type {
  GatewayStore,
  VoiceUserState,
} from './gateway-types'
export type { PlaybackStats, CaptureStats, PlayerVoicePresence } from './gateway-types'

import { createMessageHandler } from './gateway-message-handlers'
import { createUplinkController } from './gateway-uplink'
import { createVoiceStatsInterval } from './gateway-voice-stats'

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

export const useGatewayStore = create<GatewayStore>()(
  persist(
    (set, get) => {
      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

      const { uplink, updateUplinkStats, startUplinkPacer, stopUplinkPacer } =
        createUplinkController(set, get)

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

        const voiceByUser = new Map<number, VoiceUserState>()

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

          voiceStatsInterval = createVoiceStatsInterval(set, get, voiceByUser)

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

        ws.onmessage = createMessageHandler(set, get, voiceByUser)

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
