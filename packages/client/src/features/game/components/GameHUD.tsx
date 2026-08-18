import { useState } from 'react';
import {
  Eye,
  Volume2,
  VolumeX,
  Music,
  Spade,
  DoorOpen,
  LogOut,
  Bot,
  HelpCircle,
  Keyboard,
  Trash2,
  Wifi,
  Clock,
  RotateCw,
  Menu,
  Info,
} from 'lucide-react';
import { AUTOPILOT_TOGGLE_COOLDOWN_MS } from '@uno-online/shared';
import type { Card, Color } from '@uno-online/shared';
import TurnTimer from './TurnTimer';
import BlitzTimer from './BlitzTimer';
import { useSettingsStore } from '@/shared/stores/settings-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useGameStore } from '../stores/game-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import { useElapsedTimer, formatElapsed } from '../hooks/useElapsedTimer';
import { getSocket } from '@/shared/socket';
import { useServerStore } from '@/shared/stores/server-store';
import { showConfirm } from '@/shared/stores/confirm-store';
import { cn } from '@/shared/lib/utils';
import { getPingColor } from '@/shared/lib/ping';
import { BUILD_VERSION } from '@/shared/build-info';
import FitScaler from '@/shared/components/FitScaler';
import { reportSocketError } from '@/shared/report-socket-error';

const PHASE_LABEL: Record<string, string> = {
  choosing_color: '选色中…',
  challenging: '质疑中…',
  choosing_swap_target: '选交换…',
};

const COLOR_HEX: Record<Color, string> = {
  red: 'var(--color-uno-red)',
  blue: 'var(--color-uno-blue)',
  green: 'var(--color-uno-green)',
  yellow: 'var(--color-uno-yellow)',
};

const COLOR_LABEL: Record<Color, string> = {
  red: '红',
  blue: '蓝',
  green: '绿',
  yellow: '黄',
};

function getCardLabel(card: Card): string {
  switch (card.type) {
    case 'number':
      return `${card.value}`;
    case 'skip':
      return '禁';
    case 'reverse':
      return '转';
    case 'draw_two':
      return '+2';
    case 'wild':
      return '变色';
    case 'wild_draw_four':
      return '+4';
  }
}

function LatencyIndicator() {
  const currentServerId = useServerStore(s => s.currentServerId);
  const latency = useServerStore(s => s.latencyMap[currentServerId]);
  const ping = getPingColor(latency);

  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: ping.text }} title="网络延迟">
      <Wifi size={12} />
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: ping.dot, boxShadow: `0 0 4px ${ping.dot}60` }} />
      {latency != null ? `${latency}ms` : '--'}
    </span>
  );
}

function ElapsedTimers() {
  const gameStartedAt = useGameStore(s => s.gameStartedAt);
  const turnStartedAt = useGameStore(s => s.turnStartedAt);
  const phase = useGameStore(s => s.phase);
  const gameElapsed = useElapsedTimer(gameStartedAt);
  const turnElapsed = useElapsedTimer(turnStartedAt);
  const showTurn = turnElapsed !== null && phase !== 'round_end' && phase !== 'game_over';

  if (gameElapsed === null) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="全局计时 | 回合计时">
      <Clock size={12} />
      <span>{formatElapsed(gameElapsed)}</span>
      <span className="opacity-40">|</span>
      <RotateCw size={10} className="opacity-60" />
      <span>{showTurn ? formatElapsed(turnElapsed) : '--:--'}</span>
    </span>
  );
}

/** 中央状态：当前颜色/顶牌/叠加/阶段。table 与 strip 模式共用。 */
function GameStatus({ withPhase = true }: { withPhase?: boolean }) {
  const topCard = useGameStore(s => s.discardPile?.[s.discardPile.length - 1]);
  const currentColor = useGameStore(s => s.currentColor);
  const drawStack = useGameStore(s => s.drawStack);
  const phase = useGameStore(s => s.phase);

  if (!topCard || !currentColor || phase === 'round_end' || phase === 'game_over') return null;

  const hex = COLOR_HEX[currentColor];

  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-game"
        style={{ background: `color-mix(in srgb, ${hex} 20%, transparent)`, color: hex }}
      >
        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hex }} />
        <span>{COLOR_LABEL[currentColor]}</span>
        <span className="opacity-60">·</span>
        <span>{getCardLabel(topCard)}</span>
      </div>
      {drawStack > 0 && (
        <span className="rounded-full bg-destructive/20 text-destructive px-2 py-1 font-game font-bold">
          叠加 +{drawStack}
        </span>
      )}
      {withPhase && phase && PHASE_LABEL[phase] && (
        <span className="rounded-full bg-secondary text-muted-foreground px-2 py-1 font-game">
          {PHASE_LABEL[phase]}
        </span>
      )}
    </div>
  );
}

function HudIconButton({
  onClick,
  active = false,
  disabled = false,
  danger = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'bg-transparent border-none cursor-pointer transition-colors flex items-center',
        disabled && 'opacity-40 cursor-not-allowed',
        danger
          ? 'text-destructive hover:text-destructive/80'
          : active
            ? 'text-accent'
            : 'text-muted-foreground hover:text-accent',
      )}
    >
      {children}
    </button>
  );
}

interface GameHUDProps {
  roomCode: string;
  /** strip = 竖屏紧凑布局（菜单收进 MobileMenuSheet）；table = 横屏完整布局 */
  mode: 'table' | 'strip';
  onOpenHotkeys: () => void;
  onOpenMenu: () => void;
  onLeave: () => void;
  /** strip 模式：打开信息面板（玩法/村规/日志/聊天） */
  onOpenInfo?: () => void;
}

/**
 * 统一对局顶栏（合并原 TopBar / MobileStatusBar）。
 * table 模式三段：品牌信息 | 中央状态 | 操作按钮组，两侧组窄屏按宽度等比缩小。
 */
export default function GameHUD({ roomCode, mode, onOpenHotkeys, onOpenMenu, onLeave, onOpenInfo }: GameHUDProps) {
  const { colorBlindMode, toggleColorBlind, soundEnabled, toggleSound, bgmEnabled, toggleBgm } = useSettingsStore();
  const ownerId = useRoomStore(s => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const isHost = ownerId === userId;
  const toggleInfoDrawer = useGameStore(s => s.toggleInfoDrawer);
  const players = useGameStore(s => s.players);
  const isSpectator = useGameStore(s => s.isSpectator);
  const myAutopilot = players.find(p => p.id === userId)?.autopilot ?? false;
  const [autopilotCooldown, setAutopilotCooldown] = useState(false);

  const handleToggleAutopilot = () => {
    if (autopilotCooldown) return;
    setAutopilotCooldown(true);
    getSocket().emit('player:toggle-autopilot', reportSocketError);
    setTimeout(() => setAutopilotCooldown(false), AUTOPILOT_TOGGLE_COOLDOWN_MS);
  };

  const handleDissolve = async () => {
    if (
      !(await showConfirm({
        title: '解散房间',
        message: '确定要解散房间吗？所有玩家将被踢出。',
        confirmText: '解散',
        variant: 'danger',
      }))
    )
      return;
    getSocket().emit('room:dissolve', reportSocketError);
  };

  if (mode === 'strip') {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-background/60 backdrop-blur-md text-xs z-topbar">
        <GameStatus withPhase />
        <div className="flex items-center gap-2">
          <TurnTimer />
          <button
            onClick={onOpenInfo}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground active:bg-white/10"
            title="游戏信息"
          >
            <Info size={15} />
          </button>
          <button
            onClick={onOpenMenu}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary text-muted-foreground active:bg-white/10"
            title="菜单"
          >
            <Menu size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 h-11 bg-background/60 backdrop-blur-md text-caption z-topbar">
      {/* 左：品牌与房间信息（窄屏整体等比缩小） */}
      <FitScaler mode="width" align="start" origin="left center" className="flex-1 min-w-0 h-8 pointer-events-none">
        <div className="flex items-center gap-3 w-fit pointer-events-auto">
          <span className="font-bold text-primary font-game whitespace-nowrap">
            <Spade size={18} className="inline align-middle" /> UNO Online
          </span>
          <span className="text-muted-foreground whitespace-nowrap">房间: {roomCode}</span>
          <span className="text-muted-foreground/50 text-xs whitespace-nowrap">v{BUILD_VERSION}</span>
          <LatencyIndicator />
          <BlitzTimer />
          <ElapsedTimers />
        </div>
      </FitScaler>

      {/* 中：当前牌状态 */}
      <GameStatus />

      {/* 右：操作按钮（窄屏整体等比缩小） */}
      <FitScaler mode="width" align="end" origin="right center" className="flex-1 min-w-0 h-8 pointer-events-none">
        <div className="flex items-center gap-3 w-fit pointer-events-auto">
          <HudIconButton onClick={onOpenHotkeys} title="快捷键设置">
            <Keyboard size={16} />
          </HudIconButton>
          <HudIconButton onClick={toggleInfoDrawer} title="游戏信息 (H)">
            <HelpCircle size={16} />
          </HudIconButton>
          {!isSpectator && (
            <HudIconButton
              onClick={handleToggleAutopilot}
              disabled={autopilotCooldown}
              active={myAutopilot}
              title={autopilotCooldown ? '操作冷却中...' : myAutopilot ? '关闭自动托管' : '开启自动托管'}
            >
              <Bot size={16} />
            </HudIconButton>
          )}
          <HudIconButton
            onClick={toggleColorBlind}
            active={colorBlindMode}
            title={colorBlindMode ? '关闭色盲模式' : '开启色盲模式'}
          >
            <Eye size={16} />
          </HudIconButton>
          <HudIconButton onClick={toggleBgm} active={bgmEnabled} title={bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}>
            <Music size={16} />
          </HudIconButton>
          <HudIconButton onClick={toggleSound} active={soundEnabled} title={soundEnabled ? '关闭音效' : '开启音效'}>
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </HudIconButton>
          <TurnTimer />
          <HudIconButton
            onClick={onLeave}
            danger
            title={isSpectator ? '退出房间' : isHost ? '返回大厅、托管并转让房主' : '返回大厅并托管'}
          >
            {isHost ? <DoorOpen size={16} /> : <LogOut size={16} />}
          </HudIconButton>
          {isHost && (
            <HudIconButton onClick={handleDissolve} danger title="解散房间">
              <Trash2 size={16} />
            </HudIconButton>
          )}
        </div>
      </FitScaler>
    </div>
  );
}
