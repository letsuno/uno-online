import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Eye, Settings, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore } from '@/shared/stores/room-store';
import type { RoomSeatPlayer } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { getSocket, connectSocket, refreshVoicePresence, onConnectionStatus, getConnectionStatus, type ConnectionStatus } from '@/shared/socket';
import { recordRoomJoin, isRoomJoinCurrent } from '@/shared/room-join-tracker';
import VoicePanel from '@/shared/voice/VoicePanel';
import { useToastStore } from '@/shared/stores/toast-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import PlayerActionMenu from '../components/PlayerActionMenu';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import FitScaler from '@/shared/components/FitScaler';
import { useBgm } from '@/shared/sound/useBgm';
import BgmToast from '@/shared/components/BgmToast';
import GamePageShell from '@/shared/components/GamePageShell';
import SeatCircle from '../components/SeatCircle';
import SpectatorBar from '../components/SpectatorBar';
import SettingsDrawer from '../components/SettingsDrawer';
import SwapRequestDialog from '../components/SwapRequestDialog';
import { SeatContextMenu } from '../components/SeatContextMenu';
import type { RuleBotDifficulty } from '@uno-online/shared';

/* ── Component ── */

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { roomCode: storeRoomCode, seats, spectators, room, setRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();
  const songName = useBgm('lobby');
  const leaveRoomHook = useLeaveRoom();

  const [rejoinError, setRejoinError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [swapRequest, setSwapRequest] = useState<{
    requesterId: string;
    requesterName: string;
    requesterSeatIndex: number;
  } | null>(null);
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);
  const [menuTarget, setMenuTarget] = useState<{
    player: RoomSeatPlayer;
    seatIndex: number;
    position: { x: number; y: number };
  } | null>(null);
  const [seatMenu, setSeatMenu] = useState<{
    seatIndex: number;
    player: RoomSeatPlayer | null;
    position: { x: number; y: number };
  } | null>(null);

  /* Rejoin effect */
  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    let cancelled = false;

    const tryRejoin = (force = false) => {
      if (cancelled || !roomCode) return;
      if (!force && useRoomStore.getState().roomCode === roomCode) return;
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (cancelled) return;
        if (res.success) {
          recordRoomJoin(roomCode, socket.id);
          if (res.seats && res.spectators && res.room) {
            setRoom(roomCode, res.seats, res.spectators, res.room);
            refreshVoicePresence();
          }
          if (res.gameState) {
            setGameState(res.gameState);
            navigate(`/game/${roomCode}`);
          }
        } else {
          setRejoinError(res.error || '房间不存在');
        }
      });
    };

    // 断线重连（含在大厅页完成的重连）后服务端是一个全新 socket（不在任何
    // 房间的广播组里），若只信任本地 store 跳过 rejoin，本页收不到任何房间
    // 广播，30 秒后还会被断线清理静默移出座位。但**同一连接内**的页面往返
    // （对局页按返回键回到本页）不需要——那会被服务端当作玩家重连，产生
    // 关托管、撤销 round_end 投票、全房广播等副作用。以 join-tracker 记录
    // 的连接身份区分两种情况;rejoin 对"已在房间"的用户是幂等的。
    if (socket.connected) {
      if (isRoomJoinCurrent(roomCode ?? '', socket.id)) {
        // 已在广播组里。若对局还在进行(从对局页返回),直接回对局。
        const phase = useGameStore.getState().phase;
        if (phase && phase !== 'game_over' && useRoomStore.getState().roomCode === roomCode) {
          navigate(`/game/${roomCode}`);
        }
      } else {
        tryRejoin(true);
      }
    }
    if (useRoomStore.getState().roomCode === roomCode) {
      refreshVoicePresence();
    }
    const onReconnect = () => tryRejoin(true);
    socket.on('connect', onReconnect);

    const onState = (view: any) => {
      setGameState(view);
      refreshVoicePresence();
      navigate(`/game/${roomCode}`);
    };
    socket.on('game:state', onState);
    return () => {
      cancelled = true;
      socket.off('connect', onReconnect);
      socket.off('game:state', onState);
    };
  }, [roomCode, navigate, setGameState]);

  /* 连接状态:断线时给出提示与手动重连入口(等待室没有 GamePage 的遮罩) */
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(getConnectionStatus);
  useEffect(() => onConnectionStatus(setConnectionStatus), []);

  /* Socket listeners for swap requests */
  useEffect(() => {
    const socket = getSocket();
    const onSwapRequested = (data: {
      requesterId: string;
      requesterName: string;
      requesterSeatIndex: number;
    }) => setSwapRequest(data);
    const onSwapResolved = () => setSwapRequest(null);
    socket.on('seat:swap_requested', onSwapRequested);
    socket.on('seat:swap_resolved', onSwapResolved);
    return () => {
      socket.off('seat:swap_requested', onSwapRequested);
      socket.off('seat:swap_resolved', onSwapResolved);
    };
  }, []);

  /* Derived state */
  const isOwner = room?.ownerId === user?.id;
  const myPlayer =
    seats.find((s) => s !== null && s.userId === user?.id) ?? null;
  const isSpectator =
    !myPlayer && spectators.some((s) => s.userId === user?.id);
  const seatedPlayers = seats.filter(
    (s): s is RoomSeatPlayer => s !== null,
  );
  const allReady =
    seatedPlayers.length >= 2 && seatedPlayers.every((p) => p.ready);

  /* Sync houseRules from room settings */
  useEffect(() => {
    if (room?.settings?.houseRules) {
      setHouseRules({
        ...DEFAULT_HOUSE_RULES,
        ...(room.settings.houseRules as Partial<HouseRules>),
      });
    }
  }, [room?.settings?.houseRules]);

  /* ── Handlers ── */

  const toggleReady = () => {
    getSocket().emit('room:ready', !myPlayer?.ready, () => {});
  };

  const startGame = () => {
    getSocket().emit('game:start', (res: any) => {
      if (!res.success) {
        useToastStore.getState().addToast(res.error ?? '开始失败', 'error');
        return;
      }
      if (res.gameState) {
        setGameState(res.gameState);
        navigate(`/game/${roomCode}`);
      }
    });
  };

  const leaveRoom = async () => {
    const ok = isOwner
      ? await showConfirm({
          title: '离开房间',
          message: '你是房主，离开后房主权将转让给其他玩家。',
          confirmText: '离开',
        })
      : await showConfirm({
          title: '离开房间',
          message: '确定要离开房间吗？',
          confirmText: '离开',
        });
    if (!ok) return;
    leaveRoomHook();
  };

  const dissolveRoom = async () => {
    if (
      !(await showConfirm({
        title: '解散房间',
        message: '确定要解散房间吗？所有玩家将被踢出。',
        confirmText: '解散',
        variant: 'danger',
      }))
    )
      return;
    getSocket().emit('room:dissolve', () => {});
  };

  /* Seat click handler */
  const handleSeatClick = (seatIndex: number, e?: React.MouseEvent) => {
    const seat = seats[seatIndex];
    const pos = e ? { x: e.clientX, y: e.clientY } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    if (!seat) {
      // Empty seat: if spectator, take directly; if seated/owner, show context menu
      if (isSpectator && !isOwner) {
        getSocket().emit('seat:take', seatIndex, (res: { success?: boolean; error?: string }) => {
          if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
        });
      } else {
        setSeatMenu({ seatIndex, player: null, position: pos });
      }
    } else if (seat.userId === user?.id) {
      // My seat: no action
    } else if (seat.isBot) {
      // Bot: show context menu (swap, difficulty, remove)
      setSeatMenu({ seatIndex, player: seat, position: pos });
    } else {
      // Other player: show action menu
      setMenuTarget({ player: seat, seatIndex, position: pos });
    }
  };

  const handleTakeSeat = (seatIndex: number) => {
    getSocket().emit('seat:take', seatIndex, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleAddRuleBot = (difficulty: RuleBotDifficulty, seatIndex: number) => {
    getSocket().emit('room:add_bot', { difficulty, seatIndex }, (res) => {
      if (!res.success && res.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleAddAiBot = (aiProviderId: string, seatIndex: number) => {
    getSocket().emit('room:add_bot', { difficulty: 'rl', seatIndex, aiProviderId }, (res) => {
      if (!res.success && res.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleSwapWithBot = (targetUserId: string) => {
    getSocket().emit('seat:swap_request', targetUserId, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleSetBotDifficulty = (botId: string, difficulty: RuleBotDifficulty) => {
    getSocket().emit('room:set_bot_difficulty', { botId, difficulty }, (res) => {
      if (!res.success && res.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleSetBotAi = (botId: string, providerId: string) => {
    getSocket().emit('room:set_bot_ai', { botId, providerId }, (res) => {
      if (!res.success && res.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleRemoveBot = (botId: string) => {
    getSocket().emit('room:remove_bot', { botId }, (res) => {
      if (!res.success && res.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  /* Swap respond handler */
  const handleSwapRespond = (accept: boolean) => {
    if (!swapRequest) return;
    getSocket().emit(
      'seat:swap_respond',
      { requesterId: swapRequest.requesterId, accept },
      (res: { success?: boolean; error?: string }) => {
        if (!res?.success && res?.error)
          useToastStore.getState().addToast(res.error, 'error');
      },
    );
    setSwapRequest(null);
  };

  if (rejoinError) {
    return (
      <GamePageShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">{rejoinError}</p>
          <Button variant="game" onClick={() => navigate('/')} sound="click">
            返回大厅
          </Button>
        </div>
      </GamePageShell>
    );
  }

  if (storeRoomCode !== roomCode) {
    return (
      <GamePageShell>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">正在加入房间…</p>
        </div>
      </GamePageShell>
    );
  }

  return (
    <GamePageShell>
      {connectionStatus !== 'connected' && (
        <div className="fixed left-1/2 top-3 z-connection -translate-x-1/2 flex items-center gap-3 rounded-lg bg-black/80 px-4 py-2 text-sm text-white shadow-lg">
          <span>{connectionStatus === 'reconnecting' ? '连接断开,重连中…' : '连接已断开'}</span>
          {connectionStatus === 'disconnected' && (
            <button
              type="button"
              onClick={() => connectSocket()}
              className="rounded bg-primary px-3 py-1 font-game text-primary-foreground hover:opacity-90"
            >
              重新连接
            </button>
          )}
        </div>
      )}
      <FitScaler align="center" maxScale={1} className="absolute inset-0 z-card">
        <div className="flex flex-col items-center gap-6 w-[760px] portrait:w-[440px]">
        {/* Title */}
        <div className="flex items-center gap-3 shrink-0">
          <h2
            className="text-[32px] font-black text-primary"
            style={{ textShadow: '0 0 20px rgba(246,190,62,0.35)' }}
          >
            房间
          </h2>
          <span className="font-mono text-[26px] font-bold tracking-[0.18em] indent-[0.18em] text-[var(--gold-2)] bg-primary/8 border border-[rgba(246,190,62,0.32)] rounded-[14px] px-4 py-1.5">
            {roomCode}
          </span>
          <IconButton
            onClick={() => {
              const url = `${window.location.origin}/room/${roomCode}`;
              navigator.clipboard.writeText(
                `来玩 UNO 吧！房间号：${roomCode}\n${url}`,
              );
              useToastStore.getState().addToast('房间链接已复制', 'success');
            }}
            title="复制房间链接"
          >
            <Copy size={16} />
          </IconButton>
        </div>

        {/* Circular table */}
        <SeatCircle
          seats={seats}
          onSeatClick={handleSeatClick}
        />

        {/* Spectator bar */}
        <SpectatorBar spectators={spectators} />

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          {isSpectator ? (
            <p className="text-xs text-muted-foreground">点击空座位入座</p>
          ) : myPlayer ? (
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button
                variant="game"
                onClick={toggleReady}
                sound="ready"
                className="text-base px-6 py-3 tracking-normal"
              >
                {myPlayer.ready ? '取消准备' : '准备'}
              </Button>
              {isOwner && (
                <Button
                  variant="game"
                  className={cn(
                    'text-base px-6 py-3 tracking-normal',
                    !allReady && 'opacity-50',
                  )}
                  onClick={startGame}
                  disabled={!allReady}
                  sound="ready"
                >
                  开始游戏
                </Button>
              )}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            {myPlayer && (
              <Button
                variant="secondary"
                onClick={() => {
                  getSocket().emit(
                    'seat:leave',
                    (res: { success?: boolean; error?: string }) => {
                      if (!res?.success && res?.error)
                        useToastStore.getState().addToast(res.error, 'error');
                    },
                  );
                }}
                sound="click"
                size="sm"
                className="rounded-full bg-secondary border border-border text-foreground/85 hover:bg-white/[0.08] text-xs font-bold px-4 py-2"
              >
                <Eye size={12} className="inline align-middle mr-1" />
                观战
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={leaveRoom}
              sound="click"
              size="sm"
              className="rounded-full bg-secondary border border-border text-foreground/85 hover:bg-white/[0.08] text-xs font-bold px-4 py-2"
            >
              离开房间
            </Button>
            {isOwner && (
              <Button
                variant="danger"
                onClick={dissolveRoom}
                sound="danger"
                size="sm"
                className="rounded-full bg-destructive/10 border border-destructive/35 text-destructive hover:bg-destructive/18 text-xs font-bold px-4 py-2"
              >
                <Trash2 size={12} className="inline align-middle mr-1" />
                解散房间
              </Button>
            )}
          </div>
        </div>

        </div>
      </FitScaler>

      {/* Settings gear (top-right, HUD) */}
      <IconButton
        className="absolute top-5 right-5 w-11 h-11 rounded-[14px] z-topbar"
        onClick={() => setSettingsOpen(true)}
        title="房间设置"
      >
        <Settings size={18} />
      </IconButton>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isOwner={isOwner}
        room={room as any}
        houseRules={houseRules}
        onHouseRulesChange={setHouseRules}
      />
      {swapRequest && (
        <SwapRequestDialog
          requesterId={swapRequest.requesterId}
          requesterName={swapRequest.requesterName}
          requesterSeatIndex={swapRequest.requesterSeatIndex}
          onRespond={handleSwapRespond}
        />
      )}
      {seatMenu && (
        <SeatContextMenu
          seatIndex={seatMenu.seatIndex}
          player={seatMenu.player}
          isOwner={isOwner}
          isMeSeated={!!myPlayer}
          position={seatMenu.position}
          onClose={() => setSeatMenu(null)}
          onTakeSeat={() => handleTakeSeat(seatMenu.seatIndex)}
          onAddRuleBot={handleAddRuleBot}
          onAddAiBot={handleAddAiBot}
          onSwapRequest={handleSwapWithBot}
          onSetBotDifficulty={handleSetBotDifficulty}
          onSetBotAi={handleSetBotAi}
          onRemoveBot={handleRemoveBot}
        />
      )}
      {menuTarget && (
        <PlayerActionMenu
          target={menuTarget.player as any}
          isOwner={isOwner}
          roomStatus={room?.status ?? ''}
          position={menuTarget.position}
          onClose={() => setMenuTarget(null)}
          onSwapRequest={handleSwapWithBot}
        />
      )}
      <VoicePanel />
      <BgmToast song={songName} />
    </GamePageShell>
  );
}
