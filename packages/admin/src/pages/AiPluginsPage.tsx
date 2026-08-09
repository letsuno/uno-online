import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/Badge';

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
  'candidate-features': '候选特征',
  'public-state': '公开牌局（含弃牌堆）',
  'own-hand': '自身手牌',
  'opponent-hands': '对手手牌',
  'draw-piles': '摸牌堆',
  'chat-history': '聊天记录',
};

const fairnessLabels = {
  fair: '公平',
  privileged: '信息增强',
  cheat: '作弊信息',
} as const;

const fairnessVariants = {
  fair: 'success',
  privileged: 'warning',
  cheat: 'danger',
} as const;

export default function AiPluginsPage() {
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(await apiFetch<RegistrySnapshot>('/admin/ai-plugins'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取 AI 插件失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateEnabled = async (plugin: AiPluginInfo) => {
    setBusyId(plugin.id);
    try {
      setSnapshot(
        await apiFetch<RegistrySnapshot>(`/admin/ai-plugins/${encodeURIComponent(plugin.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !plugin.enabled }),
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '更新插件状态失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-white">AI 引擎管理</h2>

      <div className="rounded-lg border border-amber-700/70 bg-amber-950/35 px-4 py-3 text-sm text-amber-100">
        <div className="font-semibold">插件以服务端权限运行，仅启用已审核来源。</div>
        <div className="mt-1 text-amber-200/80">数据权限仅用于功能和公平性标识，不提供安全隔离。</div>
      </div>

      {error && <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-red-300">{error}</div>}

      {!snapshot ? (
        <div className="text-slate-400">正在读取...</div>
      ) : (
        <>
          <div className="grid gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm md:grid-cols-2">
            <div>
              <span className="text-slate-400">启动加载时间</span>
              <div className="mt-1 text-slate-200">{new Date(snapshot.initializedAt).toLocaleString()}</div>
            </div>
            <div>
              <span className="text-slate-400">插件目录</span>
              <div className="mt-1 break-all font-mono text-xs text-slate-200">
                {snapshot.communityPluginsDirectory}
              </div>
            </div>
          </div>

          <section className="overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
            <div className="border-b border-slate-700 px-4 py-3">
              <h3 className="font-semibold text-white">可用引擎</h3>
              <p className="mt-0.5 text-xs text-slate-400">
                已启用 {snapshot.providers.filter(plugin => plugin.enabled).length} / {snapshot.providers.length}
              </p>
            </div>

            <div className="divide-y divide-slate-700/80">
              {snapshot.providers.map(plugin => (
                <div
                  key={plugin.id}
                  className={`px-4 py-4 transition-colors ${plugin.enabled ? 'bg-slate-800' : 'bg-slate-900/45'}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className={`font-semibold ${plugin.enabled ? 'text-white' : 'text-slate-400'}`}>
                          {plugin.displayName}
                        </h4>
                        <Badge variant={fairnessVariants[plugin.fairness]}>{fairnessLabels[plugin.fairness]}</Badge>
                        <Badge variant="secondary">
                          {plugin.source === 'builtin' ? '内建' : '社区'} · {plugin.usesOnnx ? 'ONNX' : '决策脚本'}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-slate-500">
                        {plugin.id} · v{plugin.version} · {plugin.capabilities.minPlayers}–
                        {plugin.capabilities.maxPlayers} 人
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs text-slate-500">数据权限</span>
                        {plugin.dataAccess.length === 0 ? (
                          <Badge variant="secondary">仅候选 ID</Badge>
                        ) : (
                          plugin.dataAccess.map(permission => (
                            <Badge
                              key={permission}
                              variant={
                                permission === 'opponent-hands' || permission === 'draw-piles' ? 'danger' : 'secondary'
                              }
                            >
                              {permissionLabels[permission]}
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 lg:justify-end">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${plugin.enabled ? 'text-green-300' : 'text-slate-500'}`}>
                          {plugin.source === 'builtin' ? '内建常驻' : plugin.enabled ? '已启用' : '已停用'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-label={`${plugin.enabled ? '停用' : '启用'} ${plugin.displayName}`}
                          aria-checked={plugin.enabled}
                          disabled={plugin.source === 'builtin' || busyId !== null}
                          onClick={() => updateEnabled(plugin)}
                          className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            plugin.enabled ? 'bg-green-600' : 'bg-slate-600'
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
                  </div>
                </div>
              ))}
            </div>
          </section>

          {snapshot.loadFailures.length > 0 && (
            <section className="rounded-lg border border-red-800 bg-red-950/30 p-4">
              <h3 className="font-semibold text-red-300">启动时未能加载</h3>
              <div className="mt-3 space-y-3">
                {snapshot.loadFailures.map((failure, index) => (
                  <div key={`${failure.packageDirectory}-${index}`} className="text-sm">
                    <div className="break-all font-mono text-xs text-red-200">{failure.packageDirectory}</div>
                    <div className="mt-1 text-red-300/80">{failure.message}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
