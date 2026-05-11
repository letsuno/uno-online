import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, PlayerView } from '@uno-online/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type GameEventCallback = (event: string, data: unknown) => void;

export class UnoSocketClient {
  private socket: TypedSocket | null = null;
  private serverUrl: string;
  private token: string;
  private eventCallback: GameEventCallback | null = null;
  private _gameState: PlayerView | null = null;
  private _roomInfo: Record<string, unknown> | null = null;

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

  onGameEvent(callback: GameEventCallback): void {
    this.eventCallback = callback;
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
    this.socket?.disconnect();
    this.socket = null;
  }

  // Room operations
  createRoom(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('room:create', settings);
  }

  joinRoom(roomCode: string): Promise<Record<string, unknown>> {
    return this.request('room:join', roomCode);
  }

  leaveRoom(): Promise<Record<string, unknown>> {
    return this.request('room:leave');
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

  dissolveRoom(): Promise<Record<string, unknown>> {
    return this.request('room:dissolve');
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
        if (result && 'success' in result && !result.success) {
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

    this.socket.on('game:state', (view) => {
      this._gameState = view;
      this.eventCallback?.('game:state', view);
    });

    this.socket.on('game:update', (view) => {
      this._gameState = view;
      this.eventCallback?.('game:update', view);
    });

    this.socket.on('room:updated', (data) => {
      this._roomInfo = data;
      this.eventCallback?.('room:updated', data);
    });

    const forwardEvents: (keyof ServerToClientEvents)[] = [
      'game:card_drawn', 'game:action_rejected', 'game:next_round_vote',
      'game:over', 'game:round_end', 'game:kicked',
      'player:disconnected', 'player:reconnected', 'player:autopilot',
      'room:dissolved',
    ];
    for (const event of forwardEvents) {
      this.socket.on(event, ((...args: unknown[]) => {
        this.eventCallback?.(event, args[0]);
      }) as never);
    }
  }
}
