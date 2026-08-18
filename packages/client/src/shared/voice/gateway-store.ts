import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { GatewayStore, VoiceUserState } from './gateway-types';
export type { PlayerVoicePresence } from './gateway-types';

import { createMessageHandler } from './gateway-message-handlers';
import { createGatewaySessionReconnect } from './gateway-session-reconnect';
import { createUplinkController } from './gateway-uplink';
import { createVoiceStatsInterval } from './gateway-voice-stats';

function getGatewayUrl(): string {
  const explicit = import.meta.env.VITE_MUMBLE_GATEWAY_WS_URL;
  if (explicit) return explicit;

  if (import.meta.env.DEV) return 'ws://localhost:64737/ws';

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/mumble-ws`;
}

export const useGatewayStore = create<GatewayStore>()(
  persist(
    (set, get) => {
      const nowMs = () => performance.now();

      const { uplink, updateUplinkStats, startUplinkPacer, stopUplinkPacer } = createUplinkController(set, get);
      const sessionReconnect = createGatewaySessionReconnect(set, get);

      return {
        gatewayStatus: 'closed',
        status: 'idle',
        connectError: null,
        servers: [],

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

        init: () => {
          const existing = get()._ws;
          if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN))
            return;

          const voiceByUser = new Map<number, VoiceUserState>();
          let voiceStatsInterval: number | null = null;
          let pingInterval: number | null = null;

          let ws: WebSocket;
          try {
            ws = new WebSocket(getGatewayUrl());
          } catch (error) {
            console.error('[voice] Failed to open the gateway WebSocket', error);
            set({ _ws: null, gatewayStatus: 'closed' });
            sessionReconnect.fail('无法连接语音网关');
            return;
          }
          ws.binaryType = 'arraybuffer';
          set({ _ws: ws, gatewayStatus: 'connecting' });

          ws.onopen = () => {
            if (get()._ws !== ws) {
              ws.close();
              return;
            }
            set({ gatewayStatus: 'open' });

            // Start ping for ws RTT measurement
            pingInterval = window.setInterval(() => {
              try {
                ws.send(JSON.stringify({ type: 'ping', clientTimeMs: nowMs() }));
              } catch (error) {
                console.warn('[voice] Gateway ping failed; closing the socket', error);
                ws.close();
              }
            }, 2000);
            set({ _pingInterval: pingInterval });

            voiceStatsInterval = createVoiceStatsInterval(set, get, voiceByUser);
            sessionReconnect.gatewayOpened();
          };

          const handleMessage = createMessageHandler(set, get, voiceByUser, {
            sessionConnected: sessionReconnect.sessionConnected,
            sessionDisconnected: sessionReconnect.sessionDisconnected,
            fail: sessionReconnect.fail,
          });
          ws.onmessage = event => {
            if (get()._ws === ws) handleMessage(event);
          };

          ws.onerror = event => {
            console.error('[voice] Gateway WebSocket error', event);
          };

          ws.onclose = () => {
            if (pingInterval !== null) window.clearInterval(pingInterval);
            if (voiceStatsInterval) window.clearInterval(voiceStatsInterval);

            if (get()._ws !== ws) return;
            stopUplinkPacer();
            voiceByUser.clear();

            set({
              _ws: null,
              _pingInterval: null,
              _voiceSink: null,
              gatewayStatus: 'closed',
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
            });
            sessionReconnect.gatewayClosed();
          };
        },

        disconnect: () => {
          sessionReconnect.cancel();
          stopUplinkPacer();

          const ws = get()._ws;
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'disconnect' }));
            } catch (error) {
              console.warn('[voice] Failed to send the session disconnect request', error);
              ws.close();
            }
          }
          set({
            _voiceSink: null,
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
          });
        },

        connect: args => sessionReconnect.begin(args),

        resetError: () => set({ status: 'idle', connectError: null }),
        setError: message => sessionReconnect.fail(message),

        setVoiceSink: sink => set({ _voiceSink: sink }),

        sendMicOpus: (opus, params) => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;

          const target = params?.target ?? 0;

          const headerBytes = 4;
          const buffer = new ArrayBuffer(headerBytes + opus.byteLength);
          const view = new DataView(buffer);
          view.setUint8(0, 0x12);
          view.setUint8(1, target & 0xff);
          view.setUint8(2, 0);
          view.setUint8(3, 0);
          new Uint8Array(buffer, headerBytes).set(opus);

          if (!get().uplinkCongestionControlEnabled) {
            try {
              ws.send(buffer);
            } catch (error) {
              uplink.droppedTotal += 1;
              console.warn('[voice] Failed to send an audio frame', error);
              ws.close();
            }
            updateUplinkStats();
            return;
          }

          // Fast path: on healthy connections, send immediately (no pacing/queue).
          // We only enter pacing mode once we observe backpressure.
          const maxBuffered = get().uplinkMaxBufferedAmountBytes;
          if (uplink.queue.length === 0 && uplink.pacerId == null && ws.bufferedAmount <= maxBuffered) {
            try {
              ws.send(buffer);
            } catch (error) {
              uplink.droppedTotal += 1;
              console.warn('[voice] Failed to send an audio frame', error);
              ws.close();
            }
            updateUplinkStats();
            return;
          }

          // If the WS send buffer is already too large, drop stale queued frames and keep only the latest.
          if (ws.bufferedAmount > maxBuffered) {
            uplink.droppedTotal += uplink.queue.length;
            uplink.queue.length = 0;
            uplink.queue.push(buffer);
            startUplinkPacer();
            updateUplinkStats();
            return;
          }

          uplink.queue.push(buffer);
          // Bound in-memory queue (realtime > completeness).
          if (uplink.queue.length > 10) {
            const drop = uplink.queue.length - 10;
            uplink.droppedTotal += drop;
            uplink.queue.splice(0, drop);
          }
          startUplinkPacer();
          updateUplinkStats();
        },

        sendMicEnd: () => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;

          if (get().uplinkCongestionControlEnabled) {
            // Drop any unsent frames so "end" isn't delayed behind stale audio.
            uplink.droppedTotal += uplink.queue.length;
            uplink.queue.length = 0;
            stopUplinkPacer();
          }

          try {
            ws.send(new Uint8Array([0x03]).buffer);
          } catch (error) {
            console.warn('[voice] Failed to send the end-of-audio marker', error);
            ws.close();
          }
        },

        setPlayerVoicePresence: presence => set({ playerVoicePresence: presence }),
        upsertPlayerVoicePresence: (userId, presence) =>
          set(s => ({
            playerVoicePresence: { ...s.playerVoicePresence, [userId]: presence },
          })),
        clearPlayerVoicePresence: () => set({ playerVoicePresence: {} }),

        selectChannel: channelId => set({ selectedChannelId: channelId }),

        joinSelectedChannel: () => {
          const channelId = get().selectedChannelId;
          if (channelId == null) return;
          get().joinChannel(channelId);
        },

        joinChannel: (channelId: number) => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: 'joinChannel', channelId }));
            set({ selectedChannelId: channelId });
          } catch (error) {
            console.warn('[voice] Failed to join the selected channel', error);
            ws.close();
          }
        },

        listenChannel: (channelId: number) => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: 'listenChannel', channelId }));
          } catch (error) {
            console.warn('[voice] Failed to listen to the channel', error);
            ws.close();
          }
        },

        unlistenChannel: (channelId: number) => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          try {
            ws.send(JSON.stringify({ type: 'unlistenChannel', channelId }));
          } catch (error) {
            console.warn('[voice] Failed to stop listening to the channel', error);
            ws.close();
          }
        },

        sendTextToSelectedChannel: message => {
          const ws = get()._ws;
          if (!ws || ws.readyState !== WebSocket.OPEN) return;

          const channelId = get().selectedChannelId ?? undefined;
          const selfUserId = get().selfUserId;
          if (selfUserId === null) {
            get().setError('语音会话缺少当前用户信息');
            return;
          }
          try {
            ws.send(JSON.stringify({ type: 'textSend', channelId, message }));
          } catch (error) {
            console.warn('[voice] Failed to send a text message', error);
            ws.close();
            return;
          }

          const timestampMs = Date.now();
          const id = `${timestampMs}-local-${Math.random().toString(16).slice(2)}`;
          set(s => ({
            chat: [...s.chat, { id, senderId: selfUserId, message, timestampMs }].slice(-200),
          }));
        },

        setVoiceMode: mode => set({ voiceMode: mode }),
        setPttKey: key => set({ pttKey: key }),
        setVadThreshold: val => set({ vadThreshold: val }),
        setVadHoldTimeMs: val => set({ vadHoldTimeMs: val }),
        setOpusBitrate: bitrate => set({ opusBitrate: bitrate }),
        setUplinkCongestionControlEnabled: enabled => set({ uplinkCongestionControlEnabled: enabled }),
        setUplinkMaxBufferedAmountBytes: bytes => set({ uplinkMaxBufferedAmountBytes: bytes }),
        setMicEchoCancellation: val => set({ micEchoCancellation: val }),
        setMicNoiseSuppression: val => set({ micNoiseSuppression: val }),
        setMicAutoGainControl: val => set({ micAutoGainControl: val }),
        setRnnoiseEnabled: val => set({ rnnoiseEnabled: val }),
        setSelectedInputDeviceId: deviceId => set({ selectedInputDeviceId: deviceId }),
        setPlaybackStats: stats => {
          const prev = get().playbackStats;
          if (
            prev &&
            stats &&
            Math.round(prev.totalQueuedMs) === Math.round(stats.totalQueuedMs) &&
            Math.round(prev.maxQueuedMs) === Math.round(stats.maxQueuedMs) &&
            prev.streams === stats.streams
          )
            return;
          set({
            playbackStats: stats
              ? {
                  totalQueuedMs: Math.round(stats.totalQueuedMs),
                  maxQueuedMs: Math.round(stats.maxQueuedMs),
                  streams: stats.streams,
                }
              : null,
          });
        },
        setCaptureStats: stats => {
          const sending = stats?.sending ?? false;
          const rmsRounded = stats ? Math.round(stats.rms * 1000) / 1000 : 0;
          const prev = get();
          const speakingChanged = prev.selfSpeaking !== sending;
          const statsChanged =
            !prev.captureStats !== !stats ||
            (prev.captureStats &&
              stats &&
              (prev.captureStats.sending !== stats.sending ||
                Math.round(prev.captureStats.rms * 1000) !== Math.round(rmsRounded * 1000)));
          if (!statsChanged && !speakingChanged) return;
          set({
            ...(statsChanged ? { captureStats: stats ? { rms: rmsRounded, sending } : null } : {}),
            ...(speakingChanged ? { selfSpeaking: sending } : {}),
          });
        },
        setSelfSpeaking: speaking => set({ selfSpeaking: speaking }),
        setMicEnabled: enabled => set({ micEnabled: enabled }),
        setSpeakerMuted: muted => set({ speakerMuted: muted }),
      };
    },
    {
      name: 'mumble-gateway-storage',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
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
    },
  ),
);
