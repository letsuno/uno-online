import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Crown, Check, Copy, Eye, Trash2 } from 'lucide-react';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useRoomStore, type RoomPlayer } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { getSocket, connectSocket, refreshVoicePresence } from '@/shared/socket';
import VoicePanel from '@/shared/voice/VoicePanel';
import PlayerVoiceStatus from '@/shared/voice/PlayerVoiceStatus';
import { useToastStore } from '@/shared/stores/toast-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import PlayerActionMenu from '../components/PlayerActionMenu';
import { useLeaveRoom } from '../hooks/useLeaveRoom';
import { DEFAULT_HOUSE_RULES, HOUSE_RULES_PRESETS, HOUSE_RULE_DEFINITIONS, MAX_PLAYERS } from '@uno-online/shared';
import type { HouseRules, HouseRuleDefinition } from '@uno-online/shared';
import { Button } from '@/shared/components/ui/Button';
import { useBgm } from '@/shared/sound/useBgm';
import BgmToast from '@/shared/components/BgmToast';
import GamePageShell from '@/shared/components/GamePageShell';

/* ── House-rule rendering helpers (inlined from HouseRulesPanel) ── */

interface RuleDef extends HouseRuleDefinition {
  type: 'boolean' | 'select';
  options?: { value: any; label: string }[];
}

const RULE_EXTRAS: Partial<Record<keyof HouseRules, Pick<RuleDef, 'type' | 'options'>>> = {
  unoPenaltyCount: { type: 'select', options: [{ value: 2, label: '2张' }, { value: 4, label: '4张' }, { value: 6, label: '6张' }] },
  handLimit: { type: 'select', options: [{ value: null, label: '无限制' }, { value: 15, label: '15张' }, { value: 20, label: '20张' }, { value: 25, label: '25张' }] },
  handRevealThreshold: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 3, label: '3张' }, { value: 2, label: '2张' }] },
  blitzTimeLimit: { type: 'select', options: [{ value: null, label: '关闭' }, { value: 120, label: '2分钟' }, { value: 300, label: '5分钟' }, { value: 600, label: '10分钟' }] },
};

const RULES: RuleDef[] = HOUSE_RULE_DEFINITIONS.map((def) => ({
  ...def,
  type: 'boolean' as const,
  ...RULE_EXTRAS[def.key],
}));

/* ── Component ── */

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const user = useAuthStore((s) => s.user);
  const { players, room, setRoom } = useRoomStore();
  const setGameState = useGameStore((s) => s.setGameState);
  const navigate = useNavigate();
  const songName = useBgm('lobby');
  const leaveRoomHook = useLeaveRoom();

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    refreshVoicePresence();

    if (useRoomStore.getState().players.length === 0 && roomCode) {
      socket.emit('room:rejoin', roomCode, (res: any) => {
        if (res.success) {
          if (res.players && res.room) {
            setRoom(roomCode, res.players, res.room);
            refreshVoicePresence();
          }
          if (res.gameState) {
            setGameState(res.gameState);
            navigate(`/game/${roomCode}`);
          }
        } else {
          navigate('/lobby');
        }
      });
    }

    const onState = (view: any) => {
      setGameState(view);
      refreshVoicePresence();
      navigate(`/game/${roomCode}`);
    };
    socket.on('game:state', onState);
    return () => { socket.off('game:state', onState); };
  }, [roomCode, navigate, setGameState]);

  const isOwner = room?.ownerId === user?.id;
  const myPlayer = players.find((p) => p.userId === user?.id);
  const activePlayers = players.filter((p) => !p.spectator);
  const spectatorPlayers = players.filter((p) => p.spectator);
  const allReady = activePlayers.length >= 2 && activePlayers.every((p) => p.ready);
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);
  const [menuTarget, setMenuTarget] = useState<{ player: RoomPlayer; position: { x: number; y: number } } | null>(null);

  useEffect(() => {
    if (room?.settings?.houseRules) {
      setHouseRules({ ...DEFAULT_HOUSE_RULES, ...room.settings.houseRules });
    }
  }, [room?.settings?.houseRules]);

  const toggleReady = () => {
    getSocket().emit('room:ready', !myPlayer?.ready, () => {});
  };

  const toggleSpectator = () => {
    const newVal = !myPlayer?.spectator;
    getSocket().emit('room:toggle_spectator', newVal, (res: { success?: boolean; error?: string }) => {
      if (!res?.success && res?.error) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
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
    if (!(await showConfirm({
      title: '解散房间',
      message: '确定要解散房间吗？所有玩家将被踢出。',
      confirmText: '解散',
      variant: 'danger',
    }))) return;
    getSocket().emit('room:dissolve', () => {});
  };

  /* House-rules helpers */
  const applyPreset = (preset: string) => {
    const presetRules = HOUSE_RULES_PRESETS[preset];
    if (presetRules) {
      const newRules = { ...DEFAULT_HOUSE_RULES, ...presetRules };
      setHouseRules(newRules);
      getSocket().emit('room:update_settings', { houseRules: newRules });
    }
  };

  const toggleRule = (key: keyof HouseRules) => {
    const newRules = { ...houseRules, [key]: !houseRules[key] };
    setHouseRules(newRules);
    getSocket().emit('room:update_settings', { houseRules: newRules });
  };

  const setRuleValue = (key: keyof HouseRules, value: any) => {
    const newRules = { ...houseRules, [key]: value };
    setHouseRules(newRules);
    getSocket().emit('room:update_settings', { houseRules: newRules });
  };

  return (
    <GamePageShell>
      <div className="relative z-1 flex flex-col items-center gap-6 w-full px-8 py-20">
        {/* Title */}
        <h2 className="font-game text-[36px] text-primary text-shadow-bold flex items-center gap-3">
          房间 {roomCode}
          <button
            onClick={() => {
              const url = `${window.location.origin}/room/${roomCode}`;
              navigator.clipboard.writeText(`来玩 UNO 吧！房间号：${roomCode}\n${url}`);
              useToastStore.getState().addToast('房间链接已复制', 'success');
            }}
            className="bg-white/10 hover:bg-white/20 rounded-lg p-1.5 cursor-pointer transition-colors"
            title="复制房间链接"
          >
            <Copy size={16} className="text-muted-foreground" />
          </button>
        </h2>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-6 w-full max-w-[900px] flex-1 min-h-0">
          {/* Left: Player + spectator lists */}
          <div className="flex-1 glass-panel p-6 flex flex-col gap-4 min-h-0">
            <section>
              <h3 className="mb-4 text-sm text-muted-foreground font-game">
                玩家 ({activePlayers.length}/{MAX_PLAYERS})
              </h3>
              <div className="flex flex-col gap-1">
                {activePlayers.map((p) => {
                  const roleColor = getRoleColor(p.role);
                  const isMe = p.userId === user?.id;
                  return (
                    <div
                      key={p.userId}
                      className={cn(
                        'flex items-center justify-between py-3 px-3 rounded-lg border-b border-white/5 last:border-b-0',
                        !isMe && 'cursor-pointer hover:bg-white/5'
                      )}
                      onClick={(e) => {
                        if (isMe) return;
                        setMenuTarget({ player: p, position: { x: e.clientX, y: e.clientY } });
                      }}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2" style={roleColor ? { color: roleColor } : undefined}>
                        <span className="truncate text-base font-medium">{p.nickname}</span>
                        {p.isBot && <AiBadge />}
                        {room?.ownerId === p.userId && <Crown size={16} className="shrink-0 text-primary" />}
                        <PlayerVoiceStatus playerId={p.userId} playerName={p.nickname} isSelf={isMe} className="shrink-0" />
                      </span>
                      <span className={cn('text-xs font-medium', p.ready ? 'text-uno-green' : 'text-muted-foreground')}>
                        {p.ready ? <><Check size={14} className="inline-block align-middle" /> 已准备</> : '未准备'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {spectatorPlayers.length > 0 && (
              <section>
                <h3 className="mb-4 text-sm text-muted-foreground font-game flex items-center gap-1.5">
                  <Eye size={14} className="text-blue-400" />
                  观战 ({spectatorPlayers.length})
                </h3>
                <div className="flex flex-col gap-1">
                  {spectatorPlayers.map((p) => {
                    const roleColor = getRoleColor(p.role);
                    const isMe = p.userId === user?.id;
                    return (
                      <div
                        key={p.userId}
                        className={cn(
                          'flex items-center justify-between py-3 px-3 rounded-lg border-b border-white/5 last:border-b-0 opacity-70',
                          !isMe && 'cursor-pointer hover:bg-white/5 hover:opacity-100'
                        )}
                        onClick={(e) => {
                          if (isMe) return;
                          setMenuTarget({ player: p, position: { x: e.clientX, y: e.clientY } });
                        }}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2" style={roleColor ? { color: roleColor } : undefined}>
                          <span className="truncate text-base font-medium">{p.nickname}</span>
                          {p.isBot && <AiBadge />}
                          {room?.ownerId === p.userId && <Crown size={16} className="shrink-0 text-primary" />}
                          <PlayerVoiceStatus playerId={p.userId} playerName={p.nickname} isSelf={isMe} className="shrink-0" />
                        </span>
                        <span className="text-xs font-medium text-blue-400">
                          <Eye size={14} className="inline-block align-middle" /> 观战
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right: Settings (spectator + house rules in one panel) */}
          <div className="w-full md:w-[320px] md:shrink-0 glass-panel p-5 flex flex-col max-h-[calc(100vh-280px)]">
            {/* Spectator section */}
            <h3 className="mb-3 text-sm text-muted-foreground font-game">观战设置</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm">允许观战</label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={room?.settings?.allowSpectators ?? true}
                  onClick={() => { if (isOwner) getSocket().emit('room:update_settings', { allowSpectators: !(room?.settings?.allowSpectators ?? true) }); }}
                  disabled={!isOwner}
                  className={cn(
                    'w-11 h-6 rounded-xl relative transition-colors duration-200',
                    !isOwner ? 'cursor-default opacity-50' : 'cursor-pointer',
                    (room?.settings?.allowSpectators ?? true) ? 'bg-accent' : 'bg-white/15'
                  )}
                >
                  <span className={cn(
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    (room?.settings?.allowSpectators ?? true) ? 'translate-x-5' : ''
                  )} />
                </button>
              </div>
              {(room?.settings?.allowSpectators ?? true) && (
                <div className="flex items-center justify-between">
                  <label className="text-sm">观战模式</label>
                  <select
                    value={room?.settings?.spectatorMode ?? 'hidden'}
                    onChange={(e) => getSocket().emit('room:update_settings', { spectatorMode: e.target.value as 'full' | 'hidden' })}
                    className={cn(
                      'bg-white/[0.06] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-sm outline-none cursor-pointer',
                      !isOwner && 'opacity-50 cursor-default'
                    )}
                    disabled={!isOwner}
                  >
                    <option value="hidden">只看出牌</option>
                    <option value="full">全透视</option>
                  </select>
                </div>
              )}
            </div>

            <div className="border-b border-white/5 my-4" />

            {/* House rules section */}
            <h3 className="mb-3 text-sm text-accent font-game">村规设置</h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {(['classic', 'party', 'crazy'] as const).map((p) => (
                <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(p)} disabled={!isOwner} sound="click">
                  {p === 'classic' ? '经典' : p === 'party' ? '派对' : '疯狂'}
                </Button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
              {RULES.map((rule) => (
                <div key={rule.key} className="flex justify-between items-center py-1.5 border-b border-white/5">
                  <div className="flex-1">
                    <div className="text-caption">{rule.label}</div>
                    <div className="text-xs text-muted-foreground">{rule.description}</div>
                  </div>
                  {rule.type === 'boolean' ? (
                    <button
                      onClick={() => toggleRule(rule.key)}
                      disabled={!isOwner}
                      className={cn(
                        'w-11 h-6 rounded-xl border-none relative transition-colors duration-200',
                        !isOwner ? 'cursor-default' : 'cursor-pointer',
                        houseRules[rule.key] ? 'bg-accent' : 'bg-switch-off'
                      )}
                    >
                      <div className={cn(
                        'w-toggle-knob h-toggle-knob rounded-full bg-white absolute top-toggle-off transition-[left] duration-200',
                        houseRules[rule.key] ? 'left-toggle-on' : 'left-toggle-off'
                      )} />
                    </button>
                  ) : (
                    <select
                      value={String(houseRules[rule.key] ?? 'null')}
                      onChange={(e) => {
                        const v = e.target.value;
                        setRuleValue(rule.key, v === 'null' ? null : Number(v));
                      }}
                      disabled={!isOwner}
                      className="bg-white/[0.06] text-foreground border border-white/10 rounded-xl px-3 py-1.5 text-xs outline-none cursor-pointer"
                    >
                      {rule.options?.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value ?? 'null')}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4">
          {myPlayer?.spectator ? (
            <Button variant="game" onClick={toggleSpectator} sound="click">取消观战</Button>
          ) : (
            <Button variant="game" onClick={toggleReady} sound="ready">
              {myPlayer?.ready ? '取消准备' : '准备'}
            </Button>
          )}
          {!myPlayer?.spectator && (
            <Button variant="secondary" onClick={toggleSpectator} sound="click">
              <Eye size={14} className="inline align-middle mr-1" />观战
            </Button>
          )}
          {isOwner && (
            <Button variant="game" className={cn(!allReady && 'opacity-50')} onClick={startGame} disabled={!allReady} sound="ready">
              开始游戏
            </Button>
          )}
          <Button variant="danger" onClick={leaveRoom} sound="danger">离开房间</Button>
          {isOwner && (
            <Button variant="danger" onClick={dissolveRoom} sound="danger">
              <Trash2 size={14} className="inline align-middle mr-1" />解散房间
            </Button>
          )}
        </div>

        {menuTarget && (
          <PlayerActionMenu
            target={menuTarget.player}
            isOwner={isOwner}
            roomStatus={room?.status ?? ''}
            position={menuTarget.position}
            onClose={() => setMenuTarget(null)}
          />
        )}
      </div>
      <VoicePanel />
      <BgmToast song={songName} />
    </GamePageShell>
  );
}
