import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Copy, Eye, Settings, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore } from '@/shared/stores/room-store';
import type { RoomSeatPlayer } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { getSocket, connectSocket, refreshVoicePresence } from '@/shared/socket';
import VoicePanel from '@/shared/voice/VoicePanel';
import { useToastStore } from '@/shared/stores/toast-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import PlayerActionMenu from '../components/PlayerActionMenu';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import { DEFAULT_HOUSE_RULES } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';
import { Button } from '@/shared/components/ui/Button';
import { useBgm } from '@/shared/sound/useBgm';
import BgmToast from '@/shared/components/BgmToast';
import GamePageShell from '@/shared/components/GamePageShell';
import SeatCircle from '../components/SeatCircle';
import SpectatorBar from '../components/SpectatorBar';
import SettingsDrawer from '../components/SettingsDrawer';
import SwapRequestDialog from '../components/SwapRequestDialog';
import { SeatContextMenu } from '../components/SeatContextMenu';
import type { BotDifficulty } from '@uno-online/shared';

/* ── Component ── */

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { seats, spectators, room, setRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();
  const songName = useBgm('lobby');
  const leaveRoomHook = useLeaveRoom();

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

  /* Responsive compact detection */
  const [compact, setCompact] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setCompact(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  /* Rejoin effect */
  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    refreshVoicePresence();

    if (useRoomStore.getState().seats.every((s) => s === null) && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success) {
          if (res.seats && res.spectators && res.room) {
            setRoom(roomCode, res.seats, res.spectators, res.room);
            refreshVoicePresence();
          }
          if (res.gameState) {
            setGameState(res.gameState);
            navigate(`/game/${roomCode}`);
          }
        } else {
          navigate('/');
        }
      });
    }

    const onState = (view: any) => {
      setGameState(view);
      refreshVoicePresence();
      navigate(`/game/${roomCode}`);
    };
    socket.on('game:state', onState);
    return () => {
      socket.off('game:state', onState);
    };
  }, [roomCode, navigate, setGameState]);

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

  const handleAddBot = (difficulty: BotDifficulty, seatIndex: number) => {
    getSocket().emit('room:add_bot', { difficulty, seatIndex }, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleSwapWithBot = (targetUserId: string) => {
    getSocket().emit('seat:swap_request', targetUserId, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleSetBotDifficulty = (botId: string, difficulty: BotDifficulty) => {
    getSocket().emit('room:set_bot_difficulty', { botId, difficulty }, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
    });
  };

  const handleRemoveBot = (botId: string) => {
    getSocket().emit('room:remove_bot', { botId }, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) useToastStore.getState().addToast(res.error, 'error');
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

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center gap-4 md:gap-6 w-full h-full overflow-y-auto scrollbar-thin px-4 md:px-8 py-8 md:py-16">
        {/* Title */}
        <h2 className="font-game text-2xl md:text-[36px] text-primary text-shadow-bold flex items-center gap-2 md:gap-3 shrink-0">
          房间 {roomCode}
          <button
            onClick={() => {
              const url = `${window.location.origin}/room/${roomCode}`;
              navigator.clipboard.writeText(
                `来玩 UNO 吧！房间号：${roomCode}\n${url}`,
              );
              useToastStore.getState().addToast('房间链接已复制', 'success');
            }}
            className="bg-white/10 hover:bg-white/20 rounded-lg p-1.5 cursor-pointer transition-colors"
            title="复制房间链接"
          >
            <Copy size={16} className="text-muted-foreground" />
          </button>
        </h2>

        {/* Circular table */}
        <SeatCircle
          seats={seats}
          onSeatClick={handleSeatClick}
          compact={compact}
        />

        {/* Spectator bar */}
        <SpectatorBar spectators={spectators} compact={compact} />

        {/* Action buttons */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          {isSpectator ? (
            <p className="text-xs text-blue-400/60">点击空座位入座</p>
          ) : myPlayer ? (
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button
                variant="game"
                onClick={toggleReady}
                sound="ready"
                className="text-sm md:text-base px-5 py-2.5 tracking-normal"
              >
                {myPlayer.ready ? '取消准备' : '准备'}
              </Button>
              {isOwner && (
                <Button
                  variant="game"
                  className={cn(
                    'text-sm md:text-base px-5 py-2.5 tracking-normal',
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
                className="text-xs px-3 py-1.5"
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
              className="text-xs px-3 py-1.5"
            >
              离开房间
            </Button>
            {isOwner && (
              <Button
                variant="danger"
                onClick={dissolveRoom}
                sound="danger"
                size="sm"
                className="text-xs px-3 py-1.5"
              >
                <Trash2 size={12} className="inline align-middle mr-1" />
                解散房间
              </Button>
            )}
          </div>
        </div>

        {/* Settings gear (top-right) */}
        <button
          className="absolute top-4 right-4 w-9 h-9 bg-white/[0.08] border border-white/15 rounded-lg flex items-center justify-center hover:bg-white/15 cursor-pointer transition-colors"
          onClick={() => setSettingsOpen(true)}
          title="房间设置"
        >
          <Settings size={16} className="text-muted-foreground" />
        </button>
      </div>

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
          onAddBot={handleAddBot}
          onSwapRequest={handleSwapWithBot}
          onSetBotDifficulty={handleSetBotDifficulty}
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
