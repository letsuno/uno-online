import { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCw, RotateCcw } from 'lucide-react';
import PlayerNode from '../PlayerNode';
import { useGameStore } from '../../stores/game-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useEffectiveUserId } from '../../hooks/useEffectiveUserId';
import { useHandEffects } from '../../hooks/useHandEffects';
import { useLastPlayedCards } from '../../hooks/useLastPlayedCards';
import { useGatewayStore } from '@/shared/voice/gateway-store';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { cn } from '@/shared/lib/utils';

interface PlayerCompassProps {
  compact?: boolean;
}

/** 弧顶与相邻玩家的角距（rad）与更远玩家的角距 */
const GAP0 = 0.5;
const STEP = 0.3;

function arcAngle(offset: number): number {
  if (offset === 0) return 0;
  const a = GAP0 + (Math.abs(offset) - 1) * STEP;
  return Math.sign(offset) * a;
}

/**
 * 玩家罗盘：所有玩家（含自己）沿弧线排布，当前回合玩家自动转到弧顶居中。
 * 直接复用 PC 的 PlayerNode 组件（头像/手牌数/最近出牌/+N/倒计时环/语音状态），
 * 修改 PC 组件时两端自动同步。交互也统一：点自己=表情、点对手=投掷（PlayerNode 内置）。
 */
export default function PlayerCompass({ compact = false }: PlayerCompassProps) {
  const players = useGameStore((s) => s.players);
  const currentPlayerIndex = useGameStore((s) => s.currentPlayerIndex);
  const direction = useGameStore((s) => s.direction);
  const phase = useGameStore((s) => s.phase);
  const endRevealing = useGameStore((s) => s.endRevealLeft > 0);
  const turnEndTime = useGameStore((s) => s.turnEndTime);
  const settings = useGameStore((s) => s.settings);
  const roundNumber = useGameStore((s) => s.roundNumber);
  const lastAction = useGameStore((s) => s.lastAction);
  const userId = useEffectiveUserId();
  const ownerId = useRoomStore((s) => s.room?.ownerId);

  // 与桌面 GameTable 相同的指示数据（罗盘层算一次，下发给各 PlayerNode）
  const { handGainBumps } = useHandEffects(players, lastAction, settings, direction, roundNumber, () => null, phase, currentPlayerIndex);
  const { lastPlayedCards } = useLastPlayedCards();

  // 语音说话状态（同 GameTable）
  const mumbleUsersById = useGatewayStore((s) => s.usersById);
  const mumbleSpeakingByUserId = useGatewayStore((s) => s.speakingByUserId);
  const selfSpeaking = useGatewayStore((s) => s.selfSpeaking);
  const voicePresence = useGatewayStore((s) => s.playerVoicePresence);
  const mumbleSpeakingNames = useMemo(() => {
    const names = new Set<string>();
    for (const [uid, speaking] of Object.entries(mumbleSpeakingByUserId)) {
      if (speaking) {
        const user = mumbleUsersById[Number(uid)];
        if (user) names.add(user.name);
      }
    }
    return names;
  }, [mumbleSpeakingByUserId, mumbleUsersById]);

  // 与 GameTable 相同的互动行为：点自己=表情，点对手=投掷（PlayerNode 内置选择器）
  const handleReaction = useCallback((emoji: string) => {
    getSocket().emit('chat:message', { text: emoji });
  }, []);
  const handleThrowItem = useCallback((targetPlayerId: string, item: string) => {
    getSocket().emit('throw:item', { targetId: targetPlayerId, item }, (res: { success: boolean; error?: string }) => {
      if (!res?.success && res?.error) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
  }, []);

  // 容器宽度（按宽度收缩弧，保证两翼不出屏）
  // 用 callback ref 而非 useEffect+useRef：round_end 时本组件 return null 会卸载容器 div，
  // 新一局重新渲染出的是新 DOM 节点，callback ref 会在新节点挂载时重新测量+观察；
  // 而 useEffect([]) 不会重跑，ResizeObserver 会一直盯着已卸载的旧节点，宽度永远停在 0。
  const [containerW, setContainerW] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const update = () => {
      if (!el.isConnected) return; // 卸载瞬间 RO 会以 0×0 补发一帧，忽略
      setContainerW(el.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  // 终局展示窗期间保留罗盘（还能继续向玩家扔表情）；结算板真正显示时才隐藏
  if (((phase === 'round_end' || phase === 'game_over') && !endRevealing) || players.length === 0) return null;

  const n = players.length;
  const R = compact ? 260 : 380;
  const height = compact ? 68 : 112;
  // 两侧玩家贴近甚至部分压出屏幕边缘（跑马灯式视觉，表示两侧还有人）
  const edgeMargin = 4;
  const maxX = containerW > 0 ? containerW / 2 - edgeMargin : 150;
  // 弧顶留出头像半径（PlayerNode 以头像中心定位，顶边不外溢）
  const originY = compact ? 22 : 30;

  // 可见范围（超出淡出）；6 人局全显，10 人局两端淡出减少挤压
  const maxVisibleOffset = Math.min(Math.floor(n / 2), n >= 8 ? 3 : 4);
  // 弧宽收缩因子：最远可见玩家的 |x| 不超过 maxX
  const widestX = R * Math.sin(arcAngle(maxVisibleOffset));
  const fit = widestX > 0 ? Math.min(1, maxX / widestX) : 1;

  const DirIcon = direction === 'clockwise' ? RotateCw : RotateCcw;
  const turnTimeLimit = settings
    ? (settings.houseRules?.fastMode ? Math.floor(settings.turnTimeLimit / 2) : settings.turnTimeLimit)
    : undefined;

  return (
    <div ref={containerRef} data-allow-overflow className="relative shrink-0 overflow-visible pointer-events-none" style={{ height }}>
      <div className="absolute inset-x-0 top-0 flex justify-center">
        {players.map((player, i) => {
          // 相对当前玩家的最短弧向偏移（处理环形回绕）
          let offset = i - currentPlayerIndex;
          if (offset > n / 2) offset -= n;
          if (offset < -n / 2) offset += n;

          const theta = arcAngle(offset);
          const x = R * Math.sin(theta) * fit;
          const y = R * (1 - Math.cos(theta)) * 0.4 * fit;
          const dist = Math.abs(offset);
          const isCurrent = dist === 0;
          const scale = (isCurrent ? 1 : Math.max(0.66, 1 - dist * 0.12)) * (compact ? 0.78 : 1);
          const opacity = dist > maxVisibleOffset ? 0 : Math.max(0.35, 1 - dist * 0.2);

          const isMe = player.id === userId;
          return (
            <motion.div
              key={player.id}
              className="absolute"
              style={{ left: '50%', top: originY, pointerEvents: opacity === 0 ? 'none' : 'auto' }}
              animate={{ x, y, scale, opacity, zIndex: isCurrent ? 30 : Math.max(1, 20 - dist) }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              <PlayerNode
                player={player}
                index={i}
                isActive={i === currentPlayerIndex}
                isMe={isMe}
                isHost={player.id === ownerId}
                isSkipped={false}
                isSpeaking={isMe ? selfSpeaking : mumbleSpeakingNames.has(player.name)}
                voiceState={voicePresence[player.id]}
                position={{ x: 0, y: 0 }}
                turnEndTime={i === currentPlayerIndex ? turnEndTime : null}
                turnTimeLimit={turnTimeLimit}
                lastPlayedCard={lastPlayedCards.get(player.id)?.card ?? null}
                handGain={handGainBumps.get(player.id) ?? null}
                onReaction={handleReaction}
                onThrowItem={(item) => handleThrowItem(player.id, item)}
              />
            </motion.div>
          );
        })}
      </div>
      {/* 方向指示 */}
      <div className={cn('absolute right-2 text-muted-foreground/50', compact ? 'top-1' : 'top-3')}>
        <DirIcon size={compact ? 13 : 16} />
      </div>
    </div>
  );
}
