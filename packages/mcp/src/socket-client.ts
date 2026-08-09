import { io, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION } from '@uno-online/shared';
import type {
  BackToRoomResult,
  ClientToServerEvents,
  Color,
  DrawSide,
  PlayerView,
  RoomCreateResult,
  RoomData,
  RoomJoinResult,
  RoomLeaveResult,
  RoomRejoinResult,
  RoomSeats,
  RoomSpectator,
  ServerToClientEvents,
} from '@uno-online/shared';
import type { McpRoomInfo, McpRoomSettingsInput } from './types.js';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Successful<T> = Extract<T, { success: true }>;
type Last<Tuple extends unknown[]> = Tuple extends [...unknown[], infer Tail] ? Tail : never;
type WithoutLast<Tuple extends unknown[]> = Tuple extends [...infer Head, unknown] ? Head : never;
type CallbackResult<Event extends keyof ClientToServerEvents> =
  NonNullable<Last<Required<Parameters<ClientToServerEvents[Event]>>>> extends (result: infer Result) => void
    ? Result
    : never;
type ResultEvent = {
  [Event in keyof ClientToServerEvents]: [CallbackResult<Event>] extends [never]
    ? never
    : CallbackResult<Event> extends { success: boolean }
      ? Event
      : never;
}[keyof ClientToServerEvents];
type RequestArguments<Event extends ResultEvent> = WithoutLast<Required<Parameters<ClientToServerEvents[Event]>>>;
type SuccessfulResult<Event extends ResultEvent> = Successful<CallbackResult<Event>>;

type ForwardedServerEvent =
  | 'game:state'
  | 'game:update'
  | 'game:card_drawn'
  | 'game:next_round_vote'
  | 'game:spectator_queue'
  | 'game:round_end'
  | 'game:over'
  | 'game:back_to_room'
  | 'room:updated'
  | 'room:membership_ended'
  | 'room:moved_to_spectator'
  | 'seat:updated'
  | 'auth:kicked'
  | 'player:timeout'
  | 'player:disconnected'
  | 'player:reconnected'
  | 'player:autopilot';

export type McpGameEventData = {
  [Event in ForwardedServerEvent]: Parameters<ServerToClientEvents[Event]>[0];
} & {
  'game:rejoin_state': PlayerView;
  'room:membership_discovered': { roomCode: string; requiresExplicitRejoin: true };
  'room:discovery_failed': { error: string };
  'room:rejoin_failed': { roomCode: string; error: string };
  'room:membership_reconciled': {
    previousRoomCode: string | null;
    roomCode: string | null;
  };
  'room:membership_unknown': {
    roomCode: string | null;
    error: string;
    reconciling: boolean;
  };
  'server:protocol_mismatch': { clientProtocolVersion: number };
};

type McpGameEvent = {
  [Event in keyof McpGameEventData]: [event: Event, data: McpGameEventData[Event]];
}[keyof McpGameEventData];

export type GameEventCallback = (...event: McpGameEvent) => void;

type MembershipState = McpRoomInfo | { membership: 'none' };
type RoomSnapshot = {
  room: RoomData;
  seats: RoomSeats;
  spectators: RoomSpectator[];
};

class SocketRequestTimeoutError extends Error {
  constructor(readonly eventName: string) {
    super(`请求超时: ${eventName}`);
    this.name = 'SocketRequestTimeoutError';
  }
}

export class UnoSocketClient {
  private socket: TypedSocket | null = null;
  private serverUrl: string;
  private token: string;
  private eventCallbacks: GameEventCallback[] = [];
  private _gameState: PlayerView | null = null;
  private membership: MembershipState = { membership: 'none' };
  private _hasReceivedInitialState = false;
  /** Invalidates delayed membership discovery/reconciliation acknowledgements. */
  private membershipEpoch = 0;
  private activeMembershipOperationEpoch: number | null = null;
  private pendingMembershipReconciliation: { roomCode: string | null; epoch: number } | null = null;
  private membershipReconciliationInFlight = false;

  constructor(serverUrl: string, token: string) {
    this.serverUrl = serverUrl;
    this.token = token;
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  get gameState(): PlayerView | null {
    return this._gameState;
  }

  get roomInfo(): McpRoomInfo | null {
    return this.membership.membership === 'none' ? null : this.membership;
  }

  get currentRoomCode(): string | null {
    return this.membership.membership === 'active' ? this.membership.roomCode : null;
  }

  get suspendedRoomCode(): string | null {
    return this.membership.membership === 'suspended' ? this.membership.roomCode : null;
  }

  get hasPendingMembership(): boolean {
    return this.membership.membership === 'suspended' || this.membership.membership === 'unknown';
  }

  get hasReceivedInitialState(): boolean {
    return this._hasReceivedInitialState;
  }

  onGameEvent(callback: GameEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  private emit<Event extends keyof McpGameEventData>(event: Event, data: McpGameEventData[Event]): void {
    const args = [event, data] as McpGameEvent;
    for (const cb of this.eventCallbacks) {
      cb(...args);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        auth: { token: this.token, protocolVersion: PROTOCOL_VERSION },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      }) as TypedSocket;

      const onConnect = () => {
        this.socket?.off('connect_error', onError);
        // Discover durable membership after an MCP process restart, but keep
        // it suspended until the caller explicitly chooses to rejoin.
        void this.discoverAuthoritativeRoom()
          .catch((error: unknown) => {
            this.emit('room:discovery_failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          })
          .finally(resolve);
      };
      const onError = (err: Error) => {
        this.socket?.off('connect', onConnect);
        if (err.message === 'Protocol mismatch') {
          this.stopForProtocolMismatch();
          reject(new Error(`协议版本不匹配（客户端协议版本 ${PROTOCOL_VERSION}）`));
          return;
        }
        reject(new Error(`连接失败: ${err.message}`));
      };
      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
      this.registerEventListeners();
    });
  }

  disconnect(): void {
    this.resetRoomState();
    this.socket?.disconnect();
    this.socket = null;
  }

  private resetRoomState(): void {
    this.membershipEpoch += 1;
    this.activeMembershipOperationEpoch = null;
    this.pendingMembershipReconciliation = null;
    this.membership = { membership: 'none' };
    this._gameState = null;
    this._hasReceivedInitialState = false;
  }

  private suspendRoom(roomCode: string): void {
    this.membership = { membership: 'suspended', roomCode };
    this._gameState = null;
    this._hasReceivedInitialState = false;
  }

  private suspendUnknownMembership(): void {
    this.membership = { membership: 'unknown' };
    this._gameState = null;
    this._hasReceivedInitialState = false;
  }

  private stopForProtocolMismatch(): void {
    const socket = this.socket;
    if (!socket) return;
    socket.io.reconnection(false);
    socket.disconnect();
    this.socket = null;
    this.resetRoomState();
    this.emit('server:protocol_mismatch', { clientProtocolVersion: PROTOCOL_VERSION });
  }

  private activateRoom(roomCode: string, snapshot: RoomSnapshot, voiceChannelId: number | null): void {
    this.membership = {
      membership: 'active',
      roomCode,
      room: snapshot.room,
      seats: snapshot.seats,
      spectators: snapshot.spectators,
      voiceChannelId,
    };
  }

  private beginMembershipOperation(): number {
    this.membershipEpoch += 1;
    this.pendingMembershipReconciliation = null;
    this.activeMembershipOperationEpoch = this.membershipEpoch;
    return this.membershipEpoch;
  }

  private finishMembershipOperation(epoch: number): void {
    if (this.activeMembershipOperationEpoch === epoch) {
      this.activeMembershipOperationEpoch = null;
    }
  }

  private isCurrentMembershipOperation(epoch: number): boolean {
    return this.membershipEpoch === epoch;
  }

  private shouldIgnoreRoomStream(): boolean {
    return this.membership.membership !== 'active';
  }

  private applyRejoinResult(
    roomCode: string,
    result: Successful<RoomRejoinResult>,
    voiceChannelId: number | null = null,
  ): void {
    this.activateRoom(roomCode, result, voiceChannelId);
    if (result.mode === 'waiting') {
      this._gameState = null;
      this._hasReceivedInitialState = false;
    } else {
      this._gameState = result.gameState;
      this._hasReceivedInitialState = true;
    }
  }

  private async discoverAuthoritativeRoom(): Promise<void> {
    if (this.membership.membership !== 'none') return;
    const epoch = this.membershipEpoch;
    const { roomCode } = await this.requestCurrentRoom();
    if (!this.isCurrentMembershipOperation(epoch)) return;
    if (!roomCode) return;
    this.suspendRoom(roomCode);
    this.emit('room:membership_discovered', { roomCode, requiresExplicitRejoin: true });
  }

  private async reconcileAuthoritativeMembership(previousRoomCode: string | null, epoch: number): Promise<boolean> {
    try {
      const { roomCode } = await this.requestCurrentRoom();
      if (!this.isCurrentMembershipOperation(epoch)) return true;
      if (roomCode) this.suspendRoom(roomCode);
      else this.resetRoomState();
      this.emit('room:membership_reconciled', {
        previousRoomCode,
        roomCode,
      });
      return true;
    } catch (error) {
      if (!this.isCurrentMembershipOperation(epoch)) return true;
      if (previousRoomCode) this.suspendRoom(previousRoomCode);
      else this.suspendUnknownMembership();
      this.emit('room:membership_unknown', {
        roomCode: previousRoomCode,
        error: error instanceof Error ? error.message : String(error),
        reconciling: false,
      });
      return false;
    }
  }

  private async ensureTransportConnected(): Promise<void> {
    if (this.socket?.connected) return;
    const socket = this.socket;
    if (!socket) throw new Error('未连接到服务器');

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new SocketRequestTimeoutError('transport:connect'));
      }, 10_000);
      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      socket.once('connect', onConnect);
      socket.connect();
      if (socket.connected) onConnect();
    });
  }

  private async reconcilePendingMembership(): Promise<void> {
    const pending = this.pendingMembershipReconciliation;
    if (!pending || this.membershipReconciliationInFlight) return;
    if (!this.isCurrentMembershipOperation(pending.epoch)) {
      this.pendingMembershipReconciliation = null;
      return;
    }

    this.membershipReconciliationInFlight = true;
    let resolved = false;
    try {
      resolved = await this.reconcileAuthoritativeMembership(pending.roomCode, pending.epoch);
    } finally {
      this.membershipReconciliationInFlight = false;
      if (resolved && this.pendingMembershipReconciliation === pending) {
        this.pendingMembershipReconciliation = null;
      }
      if (
        this.pendingMembershipReconciliation &&
        this.pendingMembershipReconciliation !== pending &&
        this.socket?.connected
      ) {
        void this.reconcilePendingMembership();
      }
    }
  }

  private handleRejoinFailure(roomCode: string, epoch: number, error: unknown): void {
    if (!this.isCurrentMembershipOperation(epoch)) return;
    const message = error instanceof Error ? error.message : String(error);
    this.suspendRoom(roomCode);
    this.emit('room:rejoin_failed', { roomCode, error: message });

    if (error instanceof SocketRequestTimeoutError) {
      this.handleAmbiguousMembershipTimeout(roomCode, epoch, error);
    }
  }

  private handleAmbiguousMembershipTimeout(
    roomCode: string | null,
    epoch: number,
    error: SocketRequestTimeoutError,
  ): void {
    if (!this.isCurrentMembershipOperation(epoch)) return;
    if (roomCode) this.suspendRoom(roomCode);
    else this.suspendUnknownMembership();
    this.pendingMembershipReconciliation = { roomCode, epoch };
    this.emit('room:membership_unknown', {
      roomCode,
      error: error.message,
      reconciling: true,
    });
    // The mutation may have committed even though its ACK was lost. Query the
    // authoritative membership immediately; if the transport is actually
    // unavailable, the pending query is retried after Socket.IO reconnects.
    void this.reconcilePendingMembership();
  }

  retryPendingMembershipReconciliation(): void {
    if (this.socket?.connected) void this.reconcilePendingMembership();
  }

  // Room operations
  async createRoom(settings: McpRoomSettingsInput): Promise<Successful<RoomCreateResult>> {
    const epoch = this.beginMembershipOperation();
    try {
      let result: Successful<RoomCreateResult>;
      try {
        result = await this.request('room:create', settings);
      } catch (error) {
        if (error instanceof SocketRequestTimeoutError) {
          this.handleAmbiguousMembershipTimeout(null, epoch, error);
        }
        throw error;
      }
      if (!this.isCurrentMembershipOperation(epoch)) return result;
      this.activateRoom(result.roomCode, result, result.voiceChannelId);
      return result;
    } finally {
      this.finishMembershipOperation(epoch);
    }
  }

  async joinRoom(roomCode: string): Promise<Successful<RoomJoinResult> | Successful<RoomRejoinResult>> {
    const epoch = this.beginMembershipOperation();
    try {
      if (!this.socket?.connected && this.hasPendingMembership) {
        await this.ensureTransportConnected();
      }
      if (this.suspendedRoomCode === roomCode) {
        await this.ensureTransportConnected();
        if (!this.isCurrentMembershipOperation(epoch)) {
          throw new Error('房间状态已变更，请重试');
        }
        let result: Successful<RoomRejoinResult>;
        try {
          result = await this.request('room:rejoin', roomCode);
        } catch (error) {
          this.handleRejoinFailure(roomCode, epoch, error);
          throw error;
        }
        if (!this.isCurrentMembershipOperation(epoch)) return result;
        this.applyRejoinResult(roomCode, result);
        return result;
      }

      let result: Successful<RoomJoinResult>;
      try {
        result = await this.request('room:join', roomCode);
      } catch (error) {
        if (error instanceof SocketRequestTimeoutError) {
          this.handleAmbiguousMembershipTimeout(roomCode, epoch, error);
        }
        throw error;
      }
      if (!this.isCurrentMembershipOperation(epoch)) return result;
      if (result.rejoin === true) {
        // room:join only reports that this user already owns membership in an
        // active room; it intentionally does not join the socket adapter or
        // restore game state. This path matters after an MCP process restart,
        // where the in-memory suspended marker no longer exists.
        this.suspendRoom(roomCode);
        let rejoinResult: Successful<RoomRejoinResult>;
        try {
          rejoinResult = await this.request('room:rejoin', roomCode);
        } catch (error) {
          this.handleRejoinFailure(roomCode, epoch, error);
          throw error;
        }
        if (!this.isCurrentMembershipOperation(epoch)) return rejoinResult;
        this.applyRejoinResult(roomCode, rejoinResult, result.voiceChannelId);
        return rejoinResult;
      }
      this.activateRoom(roomCode, result, result.voiceChannelId);
      return result;
    } finally {
      this.finishMembershipOperation(epoch);
    }
  }

  async leaveRoom(): Promise<Successful<RoomLeaveResult>> {
    const roomCode = this.currentRoomCode;
    if (!roomCode) throw new Error('当前没有活动房间');
    const epoch = this.beginMembershipOperation();
    try {
      let result: Successful<RoomLeaveResult>;
      try {
        result = await this.request('room:leave');
      } catch (error) {
        if (error instanceof SocketRequestTimeoutError) {
          this.handleAmbiguousMembershipTimeout(roomCode, epoch, error);
        }
        throw error;
      }
      if (!this.isCurrentMembershipOperation(epoch)) return result;
      if (result.outcome === 'suspended') {
        this.suspendRoom(roomCode);
      } else {
        this.resetRoomState();
      }
      return result;
    } finally {
      this.finishMembershipOperation(epoch);
    }
  }

  setReady(ready: boolean): Promise<SuccessfulResult<'room:ready'>> {
    return this.request('room:ready', ready);
  }

  startGame(): Promise<SuccessfulResult<'game:start'>> {
    return this.request('game:start');
  }

  async updateSettings(settings: McpRoomSettingsInput): Promise<SuccessfulResult<'room:update_settings'>> {
    if (this.membership.membership !== 'active') {
      throw new Error('当前没有活动房间');
    }
    const activeRoomCode = this.membership.roomCode;
    const result = await this.request('room:update_settings', settings);
    if (this.membership.membership === 'active' && this.membership.roomCode === activeRoomCode) {
      this.membership = { ...this.membership, room: result.room };
    }
    return result;
  }

  async dissolveRoom(): Promise<SuccessfulResult<'room:dissolve'>> {
    const roomCode = this.currentRoomCode;
    if (!roomCode) throw new Error('当前没有活动房间');
    const epoch = this.beginMembershipOperation();
    try {
      let result: SuccessfulResult<'room:dissolve'>;
      try {
        result = await this.request('room:dissolve');
      } catch (error) {
        if (error instanceof SocketRequestTimeoutError) {
          this.handleAmbiguousMembershipTimeout(roomCode, epoch, error);
        }
        throw error;
      }
      if (this.isCurrentMembershipOperation(epoch)) this.resetRoomState();
      return result;
    } finally {
      this.finishMembershipOperation(epoch);
    }
  }

  // Game operations
  playCard(payload: { cardId: string; chosenColor?: Color }): Promise<SuccessfulResult<'game:play_card'>> {
    return this.request('game:play_card', payload);
  }

  drawCard(payload: { side: DrawSide }): Promise<SuccessfulResult<'game:draw_card'>> {
    return this.request('game:draw_card', payload);
  }

  pass(): Promise<SuccessfulResult<'game:pass'>> {
    return this.request('game:pass');
  }

  callUno(): Promise<SuccessfulResult<'game:call_uno'>> {
    return this.request('game:call_uno');
  }

  catchUno(payload: { targetPlayerId: string }): Promise<SuccessfulResult<'game:catch_uno'>> {
    return this.request('game:catch_uno', payload);
  }

  challenge(): Promise<SuccessfulResult<'game:challenge'>> {
    return this.request('game:challenge');
  }

  accept(): Promise<SuccessfulResult<'game:accept'>> {
    return this.request('game:accept');
  }

  chooseColor(payload: { color: Color }): Promise<SuccessfulResult<'game:choose_color'>> {
    return this.request('game:choose_color', payload);
  }

  chooseSwapTarget(payload: { targetId: string }): Promise<SuccessfulResult<'game:choose_swap_target'>> {
    return this.request('game:choose_swap_target', payload);
  }

  voteNextRound(): Promise<SuccessfulResult<'game:next_round'>> {
    return this.request('game:next_round');
  }

  kickPlayer(payload: { targetId: string }): Promise<SuccessfulResult<'game:kick_player'>> {
    return this.request('game:kick_player', payload);
  }

  takeSeat(seatIndex: number): Promise<SuccessfulResult<'seat:take'>> {
    return this.request('seat:take', seatIndex);
  }

  leaveSeat(): Promise<SuccessfulResult<'seat:leave'>> {
    return this.request('seat:leave');
  }

  async backToRoom(): Promise<Successful<BackToRoomResult>> {
    const activeRoom = this.membership.membership === 'active' ? this.membership : null;
    if (!activeRoom) throw new Error('当前没有活动房间');
    const result = await this.request('game:back_to_room');
    if (this.membership.membership === 'active' && this.membership.roomCode === activeRoom.roomCode) {
      this.activateRoom(activeRoom.roomCode, result, activeRoom.voiceChannelId);
      this._gameState = null;
      this._hasReceivedInitialState = false;
    }
    return result;
  }

  private request<Event extends ResultEvent>(
    event: Event,
    ...args: RequestArguments<Event>
  ): Promise<SuccessfulResult<Event>> {
    const socket = this.socket;
    if (!socket?.connected) throw new Error('未连接到服务器');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new SocketRequestTimeoutError(event)), 10_000);
      const callback = (result: CallbackResult<Event> & ({ success: true } | { success: false; error: string })) => {
        clearTimeout(timeout);
        if (!result.success) {
          reject(new Error(result.error));
        } else {
          resolve(result as SuccessfulResult<Event>);
        }
      };
      const emit = socket.emit.bind(socket) as unknown as (...parameters: unknown[]) => void;
      emit(event, ...args, callback);
    });
  }

  private requestCurrentRoom(): Promise<{ roomCode: string | null }> {
    const socket = this.socket;
    if (!socket?.connected) throw new Error('未连接到服务器');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new SocketRequestTimeoutError('user:current_room')), 10_000);
      socket.emit('user:current_room', result => {
        clearTimeout(timeout);
        resolve(result);
      });
    });
  }

  private async restoreActiveMembershipAfterReconnect(roomCode: string, epoch: number): Promise<void> {
    const voiceChannelId =
      this.membership.membership === 'active' && this.membership.roomCode === roomCode
        ? this.membership.voiceChannelId
        : null;
    try {
      const result = await this.request('room:rejoin', roomCode);
      if (!this.isCurrentMembershipOperation(epoch) || this.currentRoomCode !== roomCode) return;
      this.applyRejoinResult(roomCode, result, voiceChannelId);
    } catch (error) {
      if (!this.isCurrentMembershipOperation(epoch) || this.currentRoomCode !== roomCode) return;
      this.handleRejoinFailure(roomCode, epoch, error);
    }
  }

  private registerEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect_error', error => {
      if (error.message === 'Protocol mismatch') this.stopForProtocolMismatch();
    });

    this.socket.on('connect', () => {
      if (this.pendingMembershipReconciliation) {
        void this.reconcilePendingMembership();
        return;
      }
      // A voluntarily suspended player remains a room member, but must only
      // return through an explicit joinRoom(oldCode). A transport reconnect
      // must not silently disable their server-side autopilot.
      const roomCode = this.currentRoomCode;
      if (!roomCode) return;
      const epoch = this.membershipEpoch;
      void this.restoreActiveMembershipAfterReconnect(roomCode, epoch);
    });

    this.socket.on('game:state', view => {
      if (this.shouldIgnoreRoomStream()) return;
      const isRejoin = this._hasReceivedInitialState;
      this._gameState = view;
      this._hasReceivedInitialState = true;
      this.emit(isRejoin ? 'game:rejoin_state' : 'game:state', view);
    });

    this.socket.on('game:update', view => {
      if (this.shouldIgnoreRoomStream()) return;
      this._gameState = view;
      this.emit('game:update', view);
    });

    this.socket.on('game:round_end', data => {
      if (this.shouldIgnoreRoomStream()) return;
      this._hasReceivedInitialState = false;
      this.emit('game:round_end', data);
    });

    this.socket.on('game:over', data => {
      if (this.shouldIgnoreRoomStream()) return;
      this._hasReceivedInitialState = false;
      this.emit('game:over', data);
    });

    this.socket.on('room:updated', data => {
      if (this.membership.membership !== 'active') return;
      this.membership = { ...this.membership, room: data.room };
      this.emit('room:updated', data);
    });

    this.socket.on('seat:updated', data => {
      if (this.membership.membership !== 'active') return;
      this.membership = {
        ...this.membership,
        seats: data.seats,
        spectators: data.spectators,
      };
      this.emit('seat:updated', data);
    });

    this.socket.on('room:membership_ended', data => {
      const localRoomCode =
        this.membership.membership === 'active' || this.membership.membership === 'suspended'
          ? this.membership.roomCode
          : null;
      const matchesLocalMembership =
        data.roomCode === localRoomCode ||
        (this.membership.membership === 'unknown' && this.activeMembershipOperationEpoch === null);
      // This terminal event can race startup discovery before local room state
      // exists. Invalidate pending acknowledgements when no marker exists yet,
      // while leaving a newer, explicitly selected different room untouched.
      if (matchesLocalMembership) {
        this.resetRoomState();
      } else if (this.membership.membership === 'none' && this.activeMembershipOperationEpoch === null) {
        this.membershipEpoch += 1;
        this.pendingMembershipReconciliation = null;
      }
      this.emit('room:membership_ended', data);
    });

    this.socket.on('room:moved_to_spectator', data => {
      if (this.membership.membership === 'active' && this.membership.roomCode === data.roomCode) {
        // Membership is retained. Drop only the player view and wait for the
        // authoritative spectator game:update broadcast.
        this._gameState = null;
        this._hasReceivedInitialState = false;
      }
      this.emit('room:moved_to_spectator', data);
    });

    this.socket.on('game:back_to_room', data => {
      if (this.membership.membership !== 'active') return;
      const { roomCode, voiceChannelId } = this.membership;
      this.activateRoom(roomCode, data, voiceChannelId);
      this._gameState = null;
      this._hasReceivedInitialState = false;
      this.emit('game:back_to_room', data);
    });

    this.socket.on('auth:kicked', data => {
      this.resetRoomState();
      this.emit('auth:kicked', data);
    });

    this.socket.on('player:timeout', data => {
      if (this.shouldIgnoreRoomStream()) return;
      this.emit('player:timeout', data);
    });

    this.socket.on('game:card_drawn', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('game:card_drawn', data);
    });
    this.socket.on('game:next_round_vote', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('game:next_round_vote', data);
    });
    this.socket.on('game:spectator_queue', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('game:spectator_queue', data);
    });
    this.socket.on('player:disconnected', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('player:disconnected', data);
    });
    this.socket.on('player:reconnected', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('player:reconnected', data);
    });
    this.socket.on('player:autopilot', data => {
      if (!this.shouldIgnoreRoomStream()) this.emit('player:autopilot', data);
    });
  }
}
