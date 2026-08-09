import { useState, useRef } from 'react';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, ChevronDown, Crown, Eye, GripHorizontal, UserPlus, Users } from 'lucide-react';
import { getSocket } from '@/shared/socket';
import { showConfirm } from '@/shared/stores/confirm-store';
import { useToastStore } from '@/shared/stores/toast-store';
import { useGameStore } from '../stores/game-store';
import { useSpectatorStore } from '../stores/spectator-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useEffectiveUserId } from '../hooks/useEffectiveUserId';
import PlayerAvatar from './PlayerAvatar';
import PlayerVoiceStatus from '@/shared/voice/PlayerVoiceStatus';
import { cn, getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';

/**
 * 对局内右上角玩家列表（桌面 table 模式）：可拖拽、可折叠。
 * 当前回合玩家：左侧主色条 + 行高亮 + 头像主色描边；手牌数用迷你卡片型徽记，剩 1 张时红色告警（UNO 时刻）。
 */
export default function PlayerListPanel() {
  const players = useGameStore(s => s.players);
  const currentPlayerIndex = useGameStore(s => s.currentPlayerIndex);
  const spectators = useSpectatorStore(s => s.spectators);
  const pendingJoinQueue = useSpectatorStore(s => s.pendingJoinQueue);
  const ownerId = useRoomStore(s => s.room?.ownerId);
  const userId = useEffectiveUserId();
  const [collapsed, setCollapsed] = useState(false);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);

  if (players.length === 0) return null;

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-fab hidden md:block">
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        className="absolute top-12 right-3 pointer-events-auto"
      >
        <div className="glass-panel-sm w-[228px] overflow-hidden">
          {/* 头部：拖拽手柄 + 标题 + 折叠 */}
          <div
            className="pl-3.5 pr-2 py-2.5 flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={e => dragControls.start(e)}
          >
            <GripHorizontal size={13} className="shrink-0 text-muted-foreground/40" />
            <span className="flex-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Users size={12} /> 玩家
              <span className="rounded-full bg-white/[0.07] px-1.5 py-px text-[10px] tabular-nums">
                {players.length}
              </span>
            </span>
            <button
              type="button"
              className="p-1 rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setCollapsed(c => !c)}
              onPointerDown={e => e.stopPropagation()}
              title={collapsed ? '展开' : '折叠'}
            >
              <ChevronDown size={13} className={cn('transition-transform duration-200', !collapsed && 'rotate-180')} />
            </button>
          </div>

          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="max-h-72 overflow-y-auto scrollbar-thin border-t border-white/[0.07]">
                  <div className="py-1.5 px-1.5 flex flex-col gap-0.5">
                    {players.map((p, i: number) => {
                      const isActive = i === currentPlayerIndex;
                      const isMe = p.id === userId;
                      const roleColor = getRoleColor(p.role);
                      const unoAlert = p.handCount === 1 && !p.eliminated;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            // 行圆角与面板同心：16px 外圆角 − 6px 内边距 = 10px
                            'group relative flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-[10px] transition-colors duration-200',
                            isActive && 'bg-primary/[0.09]',
                            p.eliminated && 'opacity-40',
                            !p.connected && 'opacity-60',
                          )}
                        >
                          {/* 当前回合指示条 */}
                          <span
                            className={cn(
                              'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-0 rounded-full bg-primary transition-all duration-300',
                              isActive && 'h-[60%]',
                            )}
                          />

                          {/* 头像（Bot 用难度配色，掉线红点角标） */}
                          <div className="relative shrink-0">
                            <PlayerAvatar
                              index={i}
                              name={p.name}
                              avatarUrl={p.avatarUrl}
                              isBot={p.isBot}
                              botConfig={p.botConfig}
                              size={28}
                              highlighted={isActive}
                            />
                            {!p.connected && (
                              <span
                                className="absolute -bottom-px -right-px w-2 h-2 rounded-full bg-destructive border-2 border-[#141a2e]"
                                title="已断线"
                              />
                            )}
                          </div>

                          {/* 名字 + 徽记 */}
                          <div className="flex-1 min-w-0 flex items-center gap-1">
                            <span
                              className={cn(
                                'text-xs truncate transition-colors',
                                isActive
                                  ? 'text-primary font-bold'
                                  : isMe
                                    ? 'text-foreground font-bold'
                                    : 'text-foreground/85',
                              )}
                              style={!isActive && roleColor ? { color: roleColor } : undefined}
                            >
                              {p.name}
                            </span>
                            {isMe && (
                              <span className="shrink-0 inline-flex items-center rounded bg-primary/15 text-primary text-[10px] leading-none px-1 py-0.5">
                                你
                              </span>
                            )}
                            {p.id === ownerId && <Crown size={10} className="shrink-0 text-primary" />}
                            {p.isBot && <AiBadge className="shrink-0" />}
                          </div>

                          {/* 右侧：语音（闲置隐藏）、移交房主（hover 显示）、手牌数徽记 */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <PlayerVoiceStatus playerId={p.id} playerName={p.name} isSelf={isMe} hideIdle />
                            {ownerId === userId && !isMe && !p.isBot && (
                              <button
                                onClick={async () => {
                                  if (
                                    !(await showConfirm({
                                      title: '移交房主',
                                      message: `确定要将房主移交给 ${p.name} 吗？`,
                                      confirmText: '移交',
                                    }))
                                  )
                                    return;
                                  getSocket().emit('room:transfer_owner', { targetId: p.id }, res => {
                                    if (!res.success) useToastStore.getState().addToast(res.error, 'error');
                                  });
                                }}
                                className="opacity-0 group-hover:opacity-100 text-primary/50 hover:text-primary cursor-pointer transition-all"
                                title="移交房主"
                              >
                                <ArrowRightLeft size={11} />
                              </button>
                            )}
                            <span
                              className={cn(
                                'w-[19px] h-[25px] rounded-[5px] border flex items-center justify-center text-[10px] font-bold tabular-nums transition-colors duration-300',
                                unoAlert
                                  ? 'border-destructive/60 bg-destructive/15 text-destructive shadow-[0_0_8px_rgba(255,51,102,0.35)]'
                                  : isActive
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-white/[0.13] bg-white/[0.05] text-muted-foreground',
                              )}
                              title={`剩余 ${p.handCount} 张`}
                            >
                              {p.handCount}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {spectators.length > 0 && (
                    <>
                      <div className="mx-3.5 pt-2 pb-1 border-t border-white/[0.07] flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/70">
                        <Eye size={11} /> 观众
                        <span className="rounded-full bg-white/[0.07] px-1.5 py-px tabular-nums">
                          {spectators.length}
                        </span>
                      </div>
                      <div className="pb-2 px-1.5">
                        {spectators.map(s => {
                          const queued = pendingJoinQueue.some(entry => entry.userId === s.userId);
                          return (
                            <div
                              key={s.nickname}
                              className={cn(
                                'flex items-center gap-2 pl-3 pr-2 py-1 text-xs text-muted-foreground',
                                !s.connected && 'opacity-50',
                              )}
                            >
                              {queued ? (
                                <UserPlus size={12} className="shrink-0 text-accent" />
                              ) : (
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/40 mx-[5px] shrink-0" />
                              )}
                              <span className={cn('truncate flex-1', queued && 'text-accent')}>{s.nickname}</span>
                              {!s.connected && <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />}
                              {queued && <span className="text-[10px] text-accent shrink-0">下局加入</span>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
