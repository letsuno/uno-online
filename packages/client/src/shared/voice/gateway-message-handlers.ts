import type {
  GatewaySetState,
  GatewayGetState,
  VoiceUserState,
  ChannelState,
  UserState,
  Metrics,
} from './gateway-types';

type GatewaySessionLifecycle = {
  sessionConnected: () => boolean;
  sessionDisconnected: (reason: string) => void;
  fail: (message: string) => void;
};

const nowMs = () => performance.now();

export function createMessageHandler(
  set: GatewaySetState,
  get: GatewayGetState,
  voiceByUser: Map<number, VoiceUserState>,
  lifecycle: GatewaySessionLifecycle,
): (ev: MessageEvent) => void {
  return (ev: MessageEvent) => {
    if (ev.data instanceof ArrayBuffer) {
      const buf = ev.data;
      const view = new DataView(buf);
      if (view.byteLength < 1) return;
      const kind = view.getUint8(0);
      if (kind !== 0x11) return;

      if (view.byteLength < 11) return;
      const userId = view.getUint32(1, true);
      const target = view.getUint8(5) & 0x1f;
      const flags = view.getUint8(6);
      const isLastFrame = (flags & 0x01) !== 0;
      const sequence = view.getUint32(7, true);
      const payloadOffset = 11;
      if (payloadOffset > view.byteLength) return;
      const payloadView = new Uint8Array(buf, payloadOffset);
      const opus = new Uint8Array(payloadView.byteLength);
      opus.set(payloadView);

      const now = nowMs();
      const st = voiceByUser.get(userId) ?? { jitterMs: 0, received: 0, missing: 0, outOfOrder: 0 };
      st.received += 1;
      if (st.lastSeq != null) {
        const delta = (sequence - st.lastSeq) >>> 0;
        if (delta === 0) {
          st.outOfOrder += 1;
        } else if (delta > 1 && delta < 0x80000000) {
          st.missing += delta - 1;
        } else if (delta >= 0x80000000) {
          st.outOfOrder += 1;
        }
      }
      if (st.lastArrivalMs != null) {
        const d = Math.abs(now - st.lastArrivalMs - 20);
        st.jitterMs += (d - st.jitterMs) / 16;
      }
      st.lastSeq = sequence;
      st.lastArrivalMs = now;
      voiceByUser.set(userId, st);

      const sink = get()._voiceSink;
      if (sink) {
        sink({ userId, target, sequence, isLastFrame, opus });
      }
      return;
    }

    if (typeof ev.data !== 'string') return;
    let msg: any;
    try {
      msg = JSON.parse(ev.data);
    } catch (error) {
      console.error('[voice] Gateway returned invalid JSON', error);
      lifecycle.fail('语音网关返回了无效消息');
      return;
    }
    if (!msg || typeof msg.type !== 'string') {
      lifecycle.fail('语音网关消息缺少类型');
      return;
    }

    try {
      switch (msg.type) {
        case 'serverList': {
          if (!Array.isArray(msg.servers)) throw new Error('serverList.servers 必须是数组');
          const servers = msg.servers.map((server: any) => {
            if (!server || typeof server.id !== 'string' || typeof server.name !== 'string') {
              throw new Error('serverList 包含无效服务器');
            }
            return { id: server.id, name: server.name };
          });
          set({ servers });
          return;
        }
        case 'pong': {
          const sent = typeof msg.clientTimeMs === 'number' ? msg.clientTimeMs : null;
          if (sent == null) return;
          const rttMs = Math.round(Math.max(0, nowMs() - sent));
          if (!Number.isFinite(rttMs)) return;
          if (get().metrics.wsRttMs === rttMs) return;
          set(s => ({
            metrics: {
              ...s.metrics,
              wsRttMs: rttMs,
            },
          }));
          return;
        }
        case 'connected': {
          if (!Number.isInteger(msg.selfUserId) || !Number.isInteger(msg.rootChannelId)) {
            throw new Error('connected 消息缺少用户或根频道 ID');
          }
          if (!lifecycle.sessionConnected()) return;
          voiceByUser.clear();
          const current = get();
          set({
            status: 'connected',
            connectError: null,
            selfUserId: msg.selfUserId,
            rootChannelId: msg.rootChannelId,
            selectedChannelId: current.selectedChannelId ?? msg.rootChannelId,
            speakingByUserId: {},
            selfSpeaking: false,
          });
          return;
        }
        case 'disconnected': {
          voiceByUser.clear();
          const reason = typeof msg.reason === 'string' ? msg.reason : 'disconnected';

          set({
            _voiceSink: null,
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
          lifecycle.sessionDisconnected(reason);
          return;
        }
        case 'stateSnapshot': {
          if (!Array.isArray(msg.channels) || !Array.isArray(msg.users)) {
            throw new Error('stateSnapshot 缺少频道或用户数组');
          }
          const channelsById: Record<number, ChannelState> = {};
          const usersById: Record<number, UserState> = {};

          for (const ch of msg.channels) {
            if (
              !ch ||
              !Number.isInteger(ch.id) ||
              typeof ch.name !== 'string' ||
              (ch.parentId !== null && !Number.isInteger(ch.parentId))
            )
              throw new Error('stateSnapshot 包含无效频道');
            channelsById[ch.id] = { id: ch.id, name: ch.name, parentId: ch.parentId };
          }
          for (const u of msg.users) {
            if (
              !u ||
              !Number.isInteger(u.id) ||
              typeof u.name !== 'string' ||
              (u.channelId !== null && !Number.isInteger(u.channelId))
            )
              throw new Error('stateSnapshot 包含无效用户');
            for (const field of ['mute', 'deaf', 'suppress', 'selfMute', 'selfDeaf'] as const) {
              if (u[field] !== undefined && typeof u[field] !== 'boolean') {
                throw new Error(`stateSnapshot user.${field} 无效`);
              }
            }
            if (u.texture !== undefined && u.texture !== null && typeof u.texture !== 'string') {
              throw new Error('stateSnapshot user.texture 无效');
            }
            if (
              u.listeningChannelIds !== undefined &&
              (!Array.isArray(u.listeningChannelIds) || !u.listeningChannelIds.every(Number.isInteger))
            )
              throw new Error('stateSnapshot user.listeningChannelIds 无效');
            const entry: UserState = { id: u.id, name: u.name, channelId: u.channelId };
            if (u.mute != null) entry.mute = u.mute;
            if (u.deaf != null) entry.deaf = u.deaf;
            if (u.suppress != null) entry.suppress = u.suppress;
            if (u.selfMute != null) entry.selfMute = u.selfMute;
            if (u.selfDeaf != null) entry.selfDeaf = u.selfDeaf;
            if (u.texture != null) entry.texture = u.texture;
            if (u.listeningChannelIds != null && u.listeningChannelIds.length > 0)
              entry.listeningChannelIds = u.listeningChannelIds;
            usersById[u.id] = entry;
          }

          const current = get();
          if (current.selfUserId === null || current.rootChannelId === null) {
            throw new Error('在 connected 消息之前收到了 stateSnapshot');
          }
          const selfUser = usersById[current.selfUserId];
          if (!selfUser || selfUser.channelId === null || !channelsById[selfUser.channelId]) {
            throw new Error('stateSnapshot 缺少当前用户或其频道');
          }
          if (!channelsById[current.rootChannelId]) throw new Error('stateSnapshot 缺少根频道');

          const selectedChannelId =
            current.selectedChannelId !== null && channelsById[current.selectedChannelId]
              ? current.selectedChannelId
              : selfUser.channelId;

          set({ channelsById, usersById, selectedChannelId });
          return;
        }
        case 'channelUpsert': {
          const ch = msg.channel;
          if (
            !ch ||
            !Number.isInteger(ch.id) ||
            typeof ch.name !== 'string' ||
            (ch.parentId !== null && !Number.isInteger(ch.parentId))
          )
            throw new Error('channelUpsert.channel 无效');
          set(s => ({
            channelsById: {
              ...s.channelsById,
              [ch.id]: { id: ch.id, name: ch.name, parentId: ch.parentId },
            },
          }));
          return;
        }
        case 'channelRemove': {
          const id = msg.channelId;
          if (!Number.isInteger(id)) throw new Error('channelRemove.channelId 无效');
          set(s => {
            const next = { ...s.channelsById };
            delete next[id];
            return { channelsById: next };
          });
          return;
        }
        case 'userUpsert': {
          const u = msg.user;
          if (!u || !Number.isInteger(u.id)) throw new Error('userUpsert.user 无效');
          const currentUser = get().usersById[u.id];
          if (!currentUser && (typeof u.name !== 'string' || !Number.isInteger(u.channelId))) {
            throw new Error('新增用户缺少 name 或 channelId');
          }
          if (u.name !== undefined && typeof u.name !== 'string') throw new Error('user.name 无效');
          if (u.channelId !== undefined && u.channelId !== null && !Number.isInteger(u.channelId)) {
            throw new Error('user.channelId 无效');
          }
          for (const field of ['mute', 'deaf', 'suppress', 'selfMute', 'selfDeaf'] as const) {
            if (u[field] !== undefined && typeof u[field] !== 'boolean') {
              throw new Error(`user.${field} 无效`);
            }
          }
          if (
            u.listeningChannelIds !== undefined &&
            (!Array.isArray(u.listeningChannelIds) || !u.listeningChannelIds.every(Number.isInteger))
          )
            throw new Error('user.listeningChannelIds 无效');
          if (u.texture !== undefined && u.texture !== null && typeof u.texture !== 'string') {
            throw new Error('user.texture 无效');
          }
          set(s => {
            const prev = currentUser;
            const next: UserState = {
              id: u.id,
              name: u.name === undefined ? prev!.name : u.name,
              channelId: u.channelId === undefined ? prev!.channelId : u.channelId,
            };
            const mute = u.mute === undefined ? prev?.mute : u.mute;
            const deaf = u.deaf === undefined ? prev?.deaf : u.deaf;
            const suppress = u.suppress === undefined ? prev?.suppress : u.suppress;
            const selfMute = u.selfMute === undefined ? prev?.selfMute : u.selfMute;
            const selfDeaf = u.selfDeaf === undefined ? prev?.selfDeaf : u.selfDeaf;
            if (mute != null) next.mute = mute;
            if (deaf != null) next.deaf = deaf;
            if (suppress != null) next.suppress = suppress;
            if (selfMute != null) next.selfMute = selfMute;
            if (selfDeaf != null) next.selfDeaf = selfDeaf;
            const texture = u.texture === undefined ? prev?.texture : u.texture;
            if (texture != null) next.texture = texture;
            const listeningChannelIds =
              u.listeningChannelIds === undefined ? prev?.listeningChannelIds : u.listeningChannelIds;
            if (listeningChannelIds != null && listeningChannelIds.length > 0)
              next.listeningChannelIds = listeningChannelIds;
            return {
              usersById: { ...s.usersById, [u.id]: next },
            };
          });
          return;
        }
        case 'userRemove': {
          const id = msg.userId;
          if (!Number.isInteger(id)) throw new Error('userRemove.userId 无效');
          set(s => {
            const next = { ...s.usersById };
            delete next[id];
            const nextSpeaking = { ...s.speakingByUserId };
            delete nextSpeaking[id];
            return { usersById: next, speakingByUserId: nextSpeaking };
          });
          return;
        }
        case 'textRecv': {
          if (
            !Number.isInteger(msg.senderId) ||
            typeof msg.message !== 'string' ||
            typeof msg.timestampMs !== 'number' ||
            !Number.isFinite(msg.timestampMs)
          )
            throw new Error('textRecv 消息字段无效');
          const senderId = msg.senderId;
          const message = msg.message;
          const timestampMs = msg.timestampMs;
          const id = `${timestampMs}-${Math.random().toString(16).slice(2)}`;
          const selfUserId = get().selfUserId;
          if (
            selfUserId != null &&
            senderId === selfUserId &&
            get().chat.some(
              c => c.senderId === senderId && c.message === message && Math.abs(c.timestampMs - timestampMs) < 2000,
            )
          ) {
            return;
          }
          set(s => ({ chat: [...s.chat, { id, senderId, message, timestampMs }].slice(-200) }));
          return;
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
          };
          const prev = get().metrics as Record<string, unknown>;
          let changed = false;
          for (const k of Object.keys(update)) {
            if (prev[k] !== update[k]) {
              changed = true;
              break;
            }
          }
          if (!changed) return;
          set(s => ({
            metrics: { ...s.metrics, ...update } as Metrics,
          }));
          return;
        }
        case 'contextActionModify': {
          if (
            typeof msg.action !== 'string' ||
            typeof msg.text !== 'string' ||
            !Number.isInteger(msg.context) ||
            !Number.isInteger(msg.operation)
          )
            throw new Error('contextActionModify 消息字段无效');
          const { action, text, context, operation } = msg;

          if (operation === 1) {
            set(s => ({
              contextActions: s.contextActions.filter(a => a.action !== action),
            }));
          } else {
            set(s => ({
              contextActions: [...s.contextActions.filter(a => a.action !== action), { action, text, context }],
            }));
          }
          return;
        }
        case 'permissionQuery': {
          const channelId = typeof msg.channelId === 'number' ? msg.channelId : null;
          const permissions = typeof msg.permissions === 'number' ? msg.permissions : null;
          const flush = msg.flush === true;

          if (flush) {
            if (channelId != null && permissions != null) {
              set({ permissionsByChannelId: { [channelId]: permissions } });
            } else {
              set({ permissionsByChannelId: {} });
            }
          } else if (channelId != null && permissions != null) {
            set(s => ({
              permissionsByChannelId: { ...s.permissionsByChannelId, [channelId]: permissions },
            }));
          }
          return;
        }
        case 'serverConfig': {
          set(s => {
            const next = { ...s.mumbleServerConfig };
            if (msg.maxBandwidth != null) next.maxBandwidth = msg.maxBandwidth;
            if (msg.welcomeText != null) next.welcomeText = msg.welcomeText;
            if (msg.allowHtml != null) next.allowHtml = msg.allowHtml;
            if (msg.messageLength != null) next.messageLength = msg.messageLength;
            if (msg.imageMessageLength != null) next.imageMessageLength = msg.imageMessageLength;
            if (msg.maxUsers != null) next.maxUsers = msg.maxUsers;
            if (msg.recordingAllowed != null) next.recordingAllowed = msg.recordingAllowed;
            return { mumbleServerConfig: next };
          });
          return;
        }
        case 'error': {
          if (typeof msg.code !== 'string' || typeof msg.message !== 'string') {
            throw new Error('error 消息缺少 code 或 message');
          }
          const code = msg.code;
          const message = msg.message;
          const pretty = `[${code}] ${message}`;
          if (msg.details != null) {
            // eslint-disable-next-line no-console
            console.warn('[gateway error details]', msg.details);
          }

          if (get().status === 'connecting' || get().status === 'reconnecting') {
            lifecycle.fail(pretty);
            return;
          }

          const timestampMs = Date.now();
          const id = `${timestampMs}-system-${Math.random().toString(16).slice(2)}`;
          set(s => ({
            connectError: pretty,
            chat: [...s.chat, { id, senderId: 0, message: pretty, timestampMs }].slice(-200),
          }));
          return;
        }
        default:
          console.warn(`[voice] Ignoring unknown gateway message type: ${msg.type}`);
      }
    } catch (error) {
      console.error(`[voice] Invalid ${msg.type} gateway message`, error);
      lifecycle.fail(`语音网关消息格式错误：${msg.type}`);
    }
  };
}
