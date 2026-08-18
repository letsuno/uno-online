import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertBanner, Avatar, EmptyState, LoadingState, PageHeader, Panel, StatCard } from '@/components/AdminUi';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { apiFetch } from '@/lib/api';
import type { DashboardData } from '@/lib/admin-types';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  roleLabel,
  roomStatusLabels,
} from '@/lib/presentation';

const roomStatusVariant = { waiting: 'warning', playing: 'success', finished: 'secondary' } as const;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestController = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh = false) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      setData(await apiFetch<DashboardData>('/admin/dashboard', { signal: controller.signal }));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '读取运行概览失败');
    } finally {
      if (requestController.current === controller) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestController.current?.abort();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="运行概览"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新数据
          </Button>
        }
      />

      {error && <AlertBanner>{error}</AlertBanner>}
      {!data ? (
        <Panel>
          <LoadingState label="正在汇总服务状态…" />
        </Panel>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="注册用户" value={data.totals.users.toLocaleString('zh-CN')} />
            <StatCard label="活跃房间" value={data.totals.rooms} />
            <StatCard label="在线连接" value={data.server.onlineConnections} />
            <StatCard label="AI 引擎" value={`${data.ai.enabledProviders}/${data.ai.providers}`} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel title="游戏服务" contentClassName="p-5">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{data.server.name}</h3>
                    <Badge variant={data.server.environment === 'production' ? 'success' : 'warning'}>
                      {data.server.environment === 'production' ? '生产环境' : '开发环境'}
                    </Badge>
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{data.server.motd}</p>
                </div>
                <div className="flex items-center gap-2 rounded border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  服务正在运行
                </div>
              </div>
              <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-white/6 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['应用版本', `v${data.server.version}`],
                  ['协议版本', `v${data.server.protocolVersion}`],
                  ['运行时结构', `v${data.server.runtimeSchemaVersion}`],
                  ['持续运行', formatDuration(data.server.uptimeSeconds)],
                  ['Node.js', data.server.nodeVersion],
                  ['常驻内存', formatBytes(data.server.memory.rssBytes)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 font-mono text-sm text-slate-200">{value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel title="账号与凭据" contentClassName="p-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-500">Passkey</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{data.totals.passkeys}</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <p className="text-xs text-slate-500">API 密钥</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{data.totals.apiKeys}</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {Object.entries(data.accounts.roleCounts).map(([role, count]) => {
                  const width = data.totals.users === 0 ? 0 : Math.max(3, (count / data.totals.users) * 100);
                  return (
                    <div key={role}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          {roleLabel(role as keyof typeof data.accounts.roleCounts)}
                        </span>
                        <span className="font-mono text-slate-300">{count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="最近注册"
              action={
                <Link to="/users" className="text-xs font-medium text-blue-400 hover:text-blue-300">
                  查看全部
                </Link>
              }
            >
              {data.recentUsers.length === 0 ? (
                <EmptyState title="还没有用户" />
              ) : (
                <div className="divide-y divide-white/5">
                  {data.recentUsers.map(user => (
                    <div key={user.id} className="flex items-center gap-3 px-5 py-3.5">
                      <Avatar src={user.avatarUrl} name={user.nickname} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">{user.nickname}</p>
                        <p className="truncate text-xs text-slate-500">@{user.username}</p>
                      </div>
                      <div className="text-right">
                        <Badge
                          variant={user.role === 'admin' ? 'danger' : user.role === 'vip' ? 'warning' : 'secondary'}
                        >
                          {roleLabel(user.role)}
                        </Badge>
                        <p className="mt-1.5 text-[11px] text-slate-600" title={formatDateTime(user.createdAt)}>
                          {formatRelativeTime(user.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title="最近活跃房间"
              action={
                <Link to="/rooms" className="text-xs font-medium text-blue-400 hover:text-blue-300">
                  监控房间
                </Link>
              }
            >
              {data.recentRooms.length === 0 ? (
                <EmptyState title="当前没有房间" />
              ) : (
                <div className="divide-y divide-white/5">
                  {data.recentRooms.map(room => (
                    <div key={room.code} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="grid h-10 w-14 place-items-center rounded-lg bg-white/5 font-mono text-sm font-bold text-white ring-1 ring-white/7">
                        {room.code}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-300">房主：{room.ownerNickname ?? '未知用户'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {room.connectedPlayerCount}/{room.playerCount} 位玩家在线 · {room.spectatorCount} 位观战者
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={roomStatusVariant[room.status]}>{roomStatusLabels[room.status]}</Badge>
                        <p className="mt-1.5 text-[11px] text-slate-600" title={formatDateTime(room.lastActivityAt)}>
                          {formatRelativeTime(room.lastActivityAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
