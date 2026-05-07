export type ServerConfig = {
  id: string
  name: string
  host: string
  port: number
  tls?: {
    rejectUnauthorized?: boolean
    useCertificate?: boolean
  },
  forceTcp?: boolean
}

export type ServersFile = {
  servers: ServerConfig[]
}

export type GatewayClientMessage =
  | { type: 'connect'; serverId: string; username: string; password?: string; tokens?: string[] }
  | { type: 'disconnect' }
  | { type: 'joinChannel'; channelId: number }
  | { type: 'listenChannel'; channelId: number }
  | { type: 'unlistenChannel'; channelId: number }
  | { type: 'textSend'; message: string; channelId?: number; userId?: number }
  | { type: 'queryPermission'; channelId: number }
  | { type: 'ping'; clientTimeMs: number }

export type GatewayServerMessage =
  | { type: 'serverList'; servers: Array<Pick<ServerConfig, 'id' | 'name'>> }
  | { type: 'connected'; serverId: string; selfUserId: number; rootChannelId: number; welcomeMessage?: string; serverVersion?: unknown; maxBandwidth?: number }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; code: string; message: string; details?: unknown }
  | { type: 'pong'; clientTimeMs: number; serverTimeMs: number }
  | {
      type: 'metrics'
      wsRttMs?: number
      serverRttMs?: number
      wsBufferedAmountBytes?: number
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
    }
  | { type: 'stateSnapshot'; channels: ChannelState[]; users: UserState[] }
  | { type: 'channelUpsert'; channel: ChannelState }
  | { type: 'channelRemove'; channelId: number }
  | { type: 'userUpsert'; user: UserState }
  | { type: 'userRemove'; userId: number }
  | { type: 'textRecv'; senderId: number; message: string; targetUsers: number[]; targetChannels: number[]; targetTrees: number[]; timestampMs: number }
  | { type: 'contextActionModify'; action?: string; text?: string; context?: number; operation?: number }
  | { type: 'permissionQuery'; channelId?: number; permissions?: number; flush?: boolean }
  | { type: 'serverConfig'; maxBandwidth?: number; welcomeText?: string; allowHtml?: boolean; messageLength?: number; imageMessageLength?: number; maxUsers?: number; recordingAllowed?: boolean }

export type ChannelState = {
  id: number
  name: string
  parentId: number | null
  position?: number
  description?: string
  links?: number[]
}

export type UserState = {
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
