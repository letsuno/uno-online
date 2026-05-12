export type ServerListEntry = { id: string; name: string }

export type ChannelState = {
  id: number
  name: string
  parentId: number | null
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

export type ChatItem = {
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

export type Metrics = {
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

export type ContextAction = {
  action: string
  text: string
  context: number
}

export type MumbleServerConfig = {
  maxBandwidth?: number
  welcomeText?: string
  allowHtml?: boolean
  messageLength?: number
  imageMessageLength?: number
  maxUsers?: number
  recordingAllowed?: boolean
}

export type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type GatewayStatus = 'closed' | 'connecting' | 'open'

export type VoiceOpusFrame = {
  userId: number
  target: number
  sequence: number
  isLastFrame: boolean
  opus: Uint8Array
}

export type VoiceMode = 'vad' | 'ptt'

export type PlayerVoicePresence = {
  inVoice: boolean
  micEnabled: boolean
  speakerMuted: boolean
  speaking: boolean
  forceMuted: boolean
}

export type SavedCredentials = {
  serverId: string
  username: string
  password: string
  tokens: string
}

export type VoiceUserState = {
  lastSeq?: number
  lastArrivalMs?: number
  jitterMs: number
  received: number
  missing: number
  outOfOrder: number
}

export type GatewaySetState = (partial: Partial<GatewayStore> | ((state: GatewayStore) => Partial<GatewayStore>)) => void
export type GatewayGetState = () => GatewayStore

export type GatewayStore = {
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
  joinChannel: (channelId: number) => void
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
