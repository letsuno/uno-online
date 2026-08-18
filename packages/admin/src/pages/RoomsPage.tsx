import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SEAT_COUNT } from '@uno-online/shared';
import { AlertBanner, Avatar, EmptyState, LoadingState, PageHeader, Panel, StatCard } from '@/components/AdminUi';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { apiFetch } from '@/lib/api';
import type { AdminRoom } from '@/lib/admin-types';
import {
  botDifficultyLabels,
  enabledHouseRuleLabels,
  formatDateTime,
  formatRelativeTime,
  gamePhaseLabels,
  roleLabel,
  roomStatusLabels,
} from '@/lib/presentation';

const statusVariants = { waiting: 'warning', playing: 'success', finished: 'secondary' } as const;

interface Confirmation {
  code: string;
  type: 'dissolve' | 'cheat';
}

function RoomCard({
  room,
  busy,
  onConfirm,
}: {
  room: AdminRoom;
  busy: boolean;
  onConfirm: (value: Confirmation) => void;
}) {
  const enabledRules = enabledHouseRuleLabels(room.settings.houseRules);
  const playersBySeat = new Map(room.players.map(player => [player.seatIndex, player]));
  const seats = Array.from({ length: SEAT_COUNT }, (_, seatIndex) => playersBySeat.get(seatIndex));

  return (
    <Panel className="room-card overflow-visible">
      <div className="border-b border-white/6 px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 min-w-20 place-items-center rounded border border-slate-700 bg-slate-950 font-mono text-base font-semibold text-white">
              {room.code}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariants[room.status]}>{roomStatusLabels[room.status]}</Badge>
                {room.game && <Badge variant="default">{gamePhaseLabels[room.game.phase]}</Badge>}
              </div>
              <p className="mt-2 text-sm text-slate-300">房主：{room.ownerNickname ?? room.ownerId}</p>
              <p className="mt-1 text-xs text-slate-600" title={formatDateTime(room.lastActivityAt)}>
                最近活动 {formatRelativeTime(room.lastActivityAt)} · 创建于 {formatDateTime(room.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {room.status === 'playing' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfirm({ code: room.code, type: 'cheat' })}
                disabled={busy}
              >
                触发作弊提示
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onConfirm({ code: room.code, type: 'dissolve' })}
              disabled={busy}
            >
              {busy ? '正在处理…' : '强制解散'}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="p-5 lg:border-r lg:border-white/6">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['玩家席位', `${room.players.length}/${SEAT_COUNT}`],
              ['在线玩家', `${room.connectedPlayerCount}`],
              ['机器人', `${room.botCount}`],
              ['观战者', `${room.connectedSpectatorCount}/${room.spectators.length}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
                <p className="text-[11px] text-slate-600">{label}</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-200">{value}</p>
              </div>
            ))}
          </div>

          {room.game && (
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
              <span className="text-blue-300">第 {room.game.roundNumber} 轮</span>
              <span className="text-slate-400">当前操作：{room.game.currentPlayerName ?? '等待状态切换'}</span>
              {room.game.startedAt && (
                <span className="text-slate-600" title={formatDateTime(room.game.startedAt)}>
                  开局于 {formatRelativeTime(room.game.startedAt)}
                </span>
              )}
            </div>
          )}

          <h3 className="mb-3 text-xs font-medium text-slate-500">座位与连接状态</h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {seats.map((player, seatIndex) => (
              <div
                key={seatIndex}
                className={`min-h-24 rounded border p-3 ${
                  player ? 'border-white/7 bg-white/[0.025]' : 'border-dashed border-white/6 bg-transparent'
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-slate-700">座位 {seatIndex + 1}</span>
                  {player && (
                    <span
                      className={`h-2 w-2 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-slate-700'}`}
                      title={player.connected ? '在线' : '离线'}
                    />
                  )}
                </div>
                {player ? (
                  <div className="flex items-center gap-2.5">
                    <Avatar src={player.avatarUrl} name={player.nickname} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200" title={player.nickname}>
                        {player.nickname}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-600">
                        {player.userId === room.ownerId
                          ? '房主'
                          : player.isBot && player.botDifficulty
                            ? `机器人 · ${botDifficultyLabels[player.botDifficulty]}`
                            : roleLabel(player.role)}
                      </p>
                      <p className={`mt-1 text-[10px] ${player.ready ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {player.ready ? '已准备' : player.connected ? '未准备' : '已离线'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="pt-3 text-center text-xs text-slate-700">空位</p>
                )}
              </div>
            ))}
          </div>

          {room.spectators.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-3 text-xs font-medium text-slate-500">观战成员</h3>
              <div className="flex flex-wrap gap-2">
                {room.spectators.map(spectator => (
                  <div
                    key={spectator.userId}
                    className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-3 py-2"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${spectator.connected ? 'bg-emerald-400' : 'bg-slate-700'}`}
                    />
                    <span className="text-xs text-slate-300">{spectator.nickname}</span>
                    <span className="text-[10px] text-slate-600">{roleLabel(spectator.role)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-5">
          <h3 className="text-xs font-medium text-slate-500">房间规则</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">回合时限</dt>
              <dd className="font-mono text-slate-200">{room.settings.turnTimeLimit} 秒</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">目标分数</dt>
              <dd className="font-mono text-slate-200">{room.settings.targetScore} 分</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">允许观战</dt>
              <dd className="text-slate-200">{room.settings.allowSpectators ? '是' : '否'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">观战视角</dt>
              <dd className="text-slate-200">{room.settings.spectatorMode === 'full' ? '完整信息' : '隐藏手牌'}</dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-white/6 pt-4">
            <p className="mb-2 text-xs text-slate-500">已启用村规（{enabledRules.length}）</p>
            {enabledRules.length === 0 ? (
              <p className="text-xs text-slate-700">使用经典规则，没有额外村规</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {enabledRules.map(rule => (
                  <Badge key={rule} variant="secondary">
                    {rule}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestController = useRef<AbortController | null>(null);

  const fetchRooms = useCallback(async (background = false) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      setError(null);
      const data = await apiFetch<{ rooms: AdminRoom[] }>('/admin/rooms', { signal: controller.signal });
      setRooms(data.rooms);
      setUpdatedAt(new Date());
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '读取房间状态失败');
    } finally {
      if (requestController.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
    const timer = window.setInterval(() => void fetchRooms(true), 15_000);
    return () => {
      window.clearInterval(timer);
      requestController.current?.abort();
    };
  }, [fetchRooms]);

  const summary = useMemo(
    () => ({
      playing: rooms.filter(room => room.status === 'playing').length,
      waiting: rooms.filter(room => room.status === 'waiting').length,
      connectedPlayers: rooms.reduce((sum, room) => sum + room.connectedPlayerCount, 0),
      connectedSpectators: rooms.reduce((sum, room) => sum + room.connectedSpectatorCount, 0),
    }),
    [rooms],
  );

  const executeConfirmation = async () => {
    if (!confirmation) return;
    const { code, type } = confirmation;
    setConfirmation(null);
    setBusyCode(code);
    try {
      setError(null);
      await apiFetch(`/admin/rooms/${code}${type === 'cheat' ? '/cheat' : ''}`, {
        method: type === 'cheat' ? 'POST' : 'DELETE',
      });
      await fetchRooms(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : type === 'cheat' ? '触发作弊提示失败' : '解散房间失败');
    } finally {
      setBusyCode(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="房间监控"
        actions={
          <div className="text-right">
            <Button variant="secondary" size="sm" onClick={() => void fetchRooms(true)} disabled={refreshing}>
              <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              立即刷新
            </Button>
            {updatedAt && (
              <p className="mt-1.5 text-[10px] text-slate-600">更新于 {formatDateTime(updatedAt.getTime())}</p>
            )}
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="房间总数" value={rooms.length} />
        <StatCard label="进行中" value={summary.playing} />
        <StatCard label="在线玩家" value={summary.connectedPlayers} />
        <StatCard label="在线观战者" value={summary.connectedSpectators} />
      </section>

      {error && <AlertBanner>{error}</AlertBanner>}

      {loading ? (
        <Panel>
          <LoadingState label="正在读取房间与对局快照…" />
        </Panel>
      ) : rooms.length === 0 ? (
        <Panel>
          <EmptyState title="当前没有活跃房间" />
        </Panel>
      ) : (
        <div className="space-y-5">
          {rooms.map(room => (
            <RoomCard key={room.code} room={room} busy={busyCode === room.code} onConfirm={setConfirmation} />
          ))}
        </div>
      )}

      <Modal
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={confirmation?.type === 'cheat' ? '触发作弊提示并解散房间' : '强制解散房间'}
        description={
          confirmation?.type === 'cheat'
            ? `房间 ${confirmation.code} 的所有玩家将看到作弊检测提示，随后对局和房间会被解散。`
            : `房间 ${confirmation?.code ?? ''} 将立即关闭，所有玩家都会被移出。这项操作无法撤销。`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void executeConfirmation()}>
              {confirmation?.type === 'cheat' ? '确认触发' : '确认解散'}
            </Button>
          </>
        }
      />
    </div>
  );
}
