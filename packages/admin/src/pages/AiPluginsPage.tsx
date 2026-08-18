import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertBanner, EmptyState, LoadingState, PageHeader, Panel, StatCard } from '@/components/AdminUi';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { apiFetch } from '@/lib/api';
import { formatDateTime, formatRelativeTime } from '@/lib/presentation';

type DataAccess = 'candidate-features' | 'public-state' | 'own-hand' | 'opponent-hands' | 'draw-piles' | 'chat-history';

interface AiPluginInfo {
  id: string;
  displayName: string;
  version: string;
  source: 'builtin' | 'community';
  usesOnnx: boolean;
  dataAccess: DataAccess[];
  fairness: 'fair' | 'privileged' | 'cheat';
  capabilities: {
    minPlayers: number;
    maxPlayers: number;
    supportedHouseRules: 'all' | string[];
  };
  enabled: boolean;
}

interface RegistrySnapshot {
  initializedAt: string;
  communityPluginsDirectory: string;
  providers: AiPluginInfo[];
  loadFailures: Array<{ packageDirectory: string; message: string }>;
}

const permissionLabels: Record<DataAccess, string> = {
  'candidate-features': '候选动作特征',
  'public-state': '公开牌局',
  'own-hand': '自身手牌',
  'opponent-hands': '对手手牌',
  'draw-piles': '摸牌堆',
  'chat-history': '聊天记录',
};

const fairnessLabels = { fair: '公平信息', privileged: '增强信息', cheat: '作弊信息' } as const;
const fairnessVariants = { fair: 'success', privileged: 'warning', cheat: 'danger' } as const;

export default function AiPluginsPage() {
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestController = useRef<AbortController | null>(null);

  const load = useCallback(async (refresh = false) => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    if (refresh) setRefreshing(true);
    try {
      setError(null);
      setSnapshot(await apiFetch<RegistrySnapshot>('/admin/ai-plugins', { signal: controller.signal }));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : '读取 AI 引擎失败');
    } finally {
      if (requestController.current === controller) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestController.current?.abort();
  }, [load]);

  const updateEnabled = async (plugin: AiPluginInfo) => {
    setBusyId(plugin.id);
    try {
      setError(null);
      setSnapshot(
        await apiFetch<RegistrySnapshot>(`/admin/ai-plugins/${encodeURIComponent(plugin.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !plugin.enabled }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新 AI 引擎状态失败');
    } finally {
      setBusyId(null);
    }
  };

  const communityCount = snapshot?.providers.filter(plugin => plugin.source === 'community').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 引擎"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            刷新状态
          </Button>
        }
      />

      <div className="rounded border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
        社区引擎具有服务端进程权限，仅启用可信来源。
      </div>

      {error && <AlertBanner>{error}</AlertBanner>}

      {!snapshot ? (
        <Panel>
          <LoadingState label="正在读取 AI 注册表…" />
        </Panel>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="引擎总数" value={snapshot.providers.length} />
            <StatCard label="已启用" value={snapshot.providers.filter(plugin => plugin.enabled).length} />
            <StatCard label="社区引擎" value={communityCount} />
            <StatCard label="加载失败" value={snapshot.loadFailures.length} />
          </section>

          <Panel title="注册表信息" contentClassName="grid gap-4 p-5 md:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-xs text-slate-500">初始化时间</p>
              <p className="mt-1.5 text-sm text-slate-200">{formatDateTime(snapshot.initializedAt)}</p>
              <p className="mt-1 text-xs text-slate-600">{formatRelativeTime(snapshot.initializedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">社区插件目录</p>
              <p className="mt-1.5 break-all rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-slate-300 ring-1 ring-white/5">
                {snapshot.communityPluginsDirectory}
              </p>
            </div>
          </Panel>

          <Panel
            title="可用引擎"
            description={`已启用 ${snapshot.providers.filter(plugin => plugin.enabled).length} / ${snapshot.providers.length}`}
          >
            {snapshot.providers.length === 0 ? (
              <EmptyState title="没有注册 AI 引擎" />
            ) : (
              <div className="divide-y divide-white/5">
                {snapshot.providers.map(plugin => (
                  <article
                    key={plugin.id}
                    className={`px-5 py-5 transition-colors ${plugin.enabled ? '' : 'bg-black/10 opacity-65'}`}
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-white">{plugin.displayName}</h3>
                          <Badge variant={fairnessVariants[plugin.fairness]}>{fairnessLabels[plugin.fairness]}</Badge>
                          <Badge variant="secondary">{plugin.source === 'builtin' ? '内建引擎' : '社区引擎'}</Badge>
                          <Badge variant={plugin.usesOnnx ? 'default' : 'secondary'}>
                            {plugin.usesOnnx ? 'ONNX 模型' : '规则脚本'}
                          </Badge>
                        </div>
                        <p className="mt-2 break-all font-mono text-xs text-slate-600">
                          {plugin.id} · 版本 {plugin.version}
                        </p>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-slate-500">能力范围</p>
                            <p className="mt-1.5 text-sm text-slate-300">
                              支持 {plugin.capabilities.minPlayers}–{plugin.capabilities.maxPlayers} 人 ·{' '}
                              {plugin.capabilities.supportedHouseRules === 'all'
                                ? '支持全部村规'
                                : `支持 ${plugin.capabilities.supportedHouseRules.length} 项村规`}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">数据访问范围</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {plugin.dataAccess.length === 0 ? (
                                <Badge variant="secondary">仅候选动作标识</Badge>
                              ) : (
                                plugin.dataAccess.map(permission => (
                                  <Badge
                                    key={permission}
                                    variant={
                                      permission === 'opponent-hands' || permission === 'draw-piles'
                                        ? 'danger'
                                        : 'secondary'
                                    }
                                  >
                                    {permissionLabels[permission]}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-4 rounded border border-slate-800 bg-slate-950/40 px-3 py-2 xl:w-52">
                        <div>
                          <p
                            className={`text-sm font-medium ${plugin.enabled ? 'text-emerald-300' : 'text-slate-500'}`}
                          >
                            {plugin.source === 'builtin' ? '内建常驻' : plugin.enabled ? '已启用' : '已停用'}
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-600">
                            {plugin.source === 'builtin' ? '不可在运行时停用' : '设置持久化保存'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label={`${plugin.enabled ? '停用' : '启用'} ${plugin.displayName}`}
                          aria-checked={plugin.enabled}
                          disabled={plugin.source === 'builtin' || busyId !== null}
                          onClick={() => void updateEnabled(plugin)}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            plugin.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              plugin.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          {snapshot.loadFailures.length > 0 && (
            <Panel title="启动加载失败" className="border-rose-500/20">
              <div className="divide-y divide-rose-400/10">
                {snapshot.loadFailures.map((failure, index) => (
                  <div key={`${failure.packageDirectory}-${index}`} className="px-5 py-4">
                    <p className="break-all font-mono text-xs text-rose-200">{failure.packageDirectory}</p>
                    <p className="mt-2 text-sm leading-6 text-rose-300/70">{failure.message}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
