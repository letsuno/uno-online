import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, PlayerView } from '@uno-online/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type GameEventCallback = (event: string, data: unknown) => void;

export class UnoSocketClient {
  private socket: TypedSocket | null = null;
  private serverUrl: string;
  private token: string;
  private eventCallbacks: GameEventCallback[] = [];
  private _gameState: PlayerView | null = null;
  private _roomInfo: Record<string, unknown> | null = null;
  private _currentRoomCode: string | null = null;
  private _hasReceivedInitialState = false;

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

  get roomInfo(): Record<string, unknown> | null {
    return this._roomInfo;
  }

  get currentRoomCode(): string | null {
    return this._currentRoomCode;
  }

  get hasReceivedInitialState(): boolean {
    return this._hasReceivedInitialState;
  }

  onGameEvent(callback: GameEventCallback): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback);
    };
  }

  private emit(event: string, data: unknown): void {
    for (const cb of this.eventCallbacks) {
      cb(event, data);
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(this.serverUrl, {
        auth: { token: this.token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      }) as TypedSocket;

      const onConnect = () => {
        this.socket?.off('connect_error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        this.socket?.off('connect', onConnect);
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
    this._currentRoomCode = null;
    this._gameState = null;
    this._roomInfo = null;
    this._hasReceivedInitialState = false;
  }

  // Room operations
  async createRoom(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.request('room:create', settings);
    if (result.roomCode) this._currentRoomCode = result.roomCode as string;
    return result;
  }

  async joinRoom(roomCode: string): Promise<Record<string, unknown>> {
    const result = await this.request('room:join', roomCode);
    this._currentRoomCode = roomCode;
    return result;
  }

  async leaveRoom(): Promise<Record<string, unknown>> {
    const result = await this.request('room:leave');
    this.resetRoomState();
    return result;
  }

  setReady(ready: boolean): Promise<Record<string, unknown>> {
    return this.request('room:ready', ready);
  }

  startGame(): Promise<Record<string, unknown>> {
    return this.request('game:start');
  }

  updateSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('room:update_settings', settings);
  }

  async dissolveRoom(): Promise<Record<string, unknown>> {
    const result = await this.request('room:dissolve');
    this.resetRoomState();
    return result;
  }

  // Game operations
  playCard(payload: { cardId: string; chosenColor?: string }): Promise<Record<string, unknown>> {
    return this.request('game:play_card', payload);
  }

  drawCard(payload: { side?: string }): Promise<Record<string, unknown>> {
    return this.request('game:draw_card', payload);
  }

  pass(): Promise<Record<string, unknown>> {
    return this.request('game:pass');
  }

  callUno(): Promise<Record<string, unknown>> {
    return this.request('game:call_uno');
  }

  catchUno(payload: { targetPlayerId: string }): Promise<Record<string, unknown>> {
    return this.request('game:catch_uno', payload);
  }

  challenge(): Promise<Record<string, unknown>> {
    return this.request('game:challenge');
  }

  accept(): Promise<Record<string, unknown>> {
    return this.request('game:accept');
  }

  chooseColor(payload: { color: string }): Promise<Record<string, unknown>> {
    return this.request('game:choose_color', payload);
  }

  chooseSwapTarget(payload: { targetId: string }): Promise<Record<string, unknown>> {
    return this.request('game:choose_swap_target', payload);
  }

  voteNextRound(): Promise<Record<string, unknown>> {
    return this.request('game:next_round');
  }

  kickPlayer(payload: { targetId?: string }): Promise<Record<string, unknown>> {
    return this.request('game:kick_player', payload);
  }

  rematch(): Promise<Record<string, unknown>> {
    return this.request('game:rematch');
  }

  private request(event: string, ...args: unknown[]): Promise<Record<string, unknown>> {
    if (!this.socket?.connected) throw new Error('未连接到服务器');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('请求超时')), 10000);
      const callback = (result: Record<string, unknown>) => {
        clearTimeout(timeout);
        if (result && ('error' in result || ('success' in result && !result.success))) {
          reject(new Error((result.error as string) ?? '操作失败'));
        } else {
          resolve(result);
        }
      };
      (this.socket as Socket).emit(event, ...args, callback);
    });
  }

  private registerEventListeners(): void {
    if (!this.socket) return;

    this.socket.io.on('reconnect', () => {
      if (this._currentRoomCode) {
        (this.socket as Socket).emit('room:rejoin', this._currentRoomCode, (res: Record<string, unknown>) => {
          if (res && !res.success) {
            this._currentRoomCode = null;
            this._gameState = null;
            this._roomInfo = null;
            this._hasReceivedInitialState = false;
          }
        });
      }
    });

    this.socket.on('game:state', (view) => {
      const isRejoin = this._hasReceivedInitialState;
      this._gameState = view;
      this._hasReceivedInitialState = true;
      this.emit(isRejoin ? 'game:rejoin_state' : 'game:state', view);
    });

    this.socket.on('game:update', (view) => {
      this._gameState = view;
      this.emit('game:update', view);
    });

    this.socket.on('game:round_end', (data) => {
      this._hasReceivedInitialState = false;
      this.emit('game:round_end', data);
    });

    this.socket.on('game:over', (data) => {
      this._hasReceivedInitialState = false;
      this.emit('game:over', data);
    });

    this.socket.on('room:updated', (data) => {
      this._roomInfo = data;
      this.emit('room:updated', data);
    });

    this.socket.on('room:dissolved', (data) => {
      this.resetRoomState();
      this.emit('room:dissolved', data);
    });

    this.socket.on('game:kicked', (data) => {
      this.resetRoomState();
      this.emit('game:kicked', data);
    });

    this.socket.on('auth:kicked', (data) => {
      this.resetRoomState();
      this.emit('auth:kicked', data);
    });

    this.socket.on('player:timeout', (data) => {
      this.emit('player:timeout', data);
    });

    const forwardEvents: (keyof ServerToClientEvents)[] = [
      'game:card_drawn', 'game:action_rejected', 'game:next_round_vote',
      'player:disconnected', 'player:reconnected', 'player:autopilot',
    ];
    for (const event of forwardEvents) {
      this.socket.on(event, ((...args: unknown[]) => {
        this.emit(event, args[0]);
      }) as never);
    }
  }
}
