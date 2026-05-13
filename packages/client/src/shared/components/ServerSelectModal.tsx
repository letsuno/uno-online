import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Server, X, Users, Home, Clock, Signal, Plus, Trash2 } from 'lucide-react';
import { useServerStore } from '../stores/server-store';
import type { ServerEntry } from '../stores/server-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { disconnectSocket } from '../socket';

function getLatencyColor(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '#666';
  if (ms < 50) return '#4ade80';
  if (ms <= 150) return '#fbbf24';
  return '#ef4444';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时`;
  return `${Math.floor(seconds / 86400)}天`;
}

function ServerCard({
  server,
  isSelected,
  onSelect,
  onRemove,
  info,
  latency,
}: {
  server: ServerEntry;
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  info: { name: string; version: string; motd: string; onlinePlayers: number; activeRooms: number; uptime: number } | null;
  latency: number | null | undefined;
}) {
  const isOnline = info !== null;

  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-xl border p-3.5 transition-colors"
      style={{
        background: isSelected ? 'rgba(251,191,36,0.08)' : 'rgba(255,255,255,0.04)',
        borderColor: isSelected ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.1)',
        borderWidth: isSelected ? '1.5px' : '1px',
        opacity: isOnline ? 1 : 0.5,
      }}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: isOnline ? '#4ade80' : '#ef4444' }}
          />
          <span className="text-[15px] font-bold text-foreground">
            {info?.name ?? server.name}
          </span>
          {info && (
            <span className="text-xs text-muted-foreground">v{info.version}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && !server.isDefault && (
            <span className="text-xs text-muted-foreground">离线</span>
          )}
          {!server.isDefault && onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* MOTD */}
      {info ? (
        <p className="mb-2 text-[13px] text-muted-foreground">{info.motd}</p>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {server.address || '当前部署'}
        </p>
      )}

      {/* Stats row */}
      {info && (
        <div className="flex items-center text-xs text-muted-foreground">
          <div className="flex flex-1 gap-3.5">
            <span className="flex items-center gap-1">
              <Users size={12} /> {info.onlinePlayers} 在线
            </span>
            <span className="flex items-center gap-1">
              <Home size={12} /> {info.activeRooms} 房间
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> 运行 {formatUptime(info.uptime)}
            </span>
          </div>
          <span
            className="flex items-center gap-1 font-medium"
            style={{ color: getLatencyColor(latency) }}
          >
            <Signal size={12} /> {latency !== null && latency !== undefined ? `${latency}ms` : '--'}
          </span>
        </div>
      )}
    </div>
  );
}

export function ServerSelectModal() {
  const {
    servers,
    currentServerId,
    serverInfoMap,
    latencyMap,
    isModalOpen,
    closeModal,
    selectServer,
    addServer,
    removeServer,
    refreshAll,
  } = useServerStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [newAddress, setNewAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (isModalOpen) {
      void refreshAll();
    }
  }, [isModalOpen]);

  const handleSelect = (id: string) => {
    if (id === currentServerId) return;
    disconnectSocket();
    logout();
    selectServer(id);
    closeModal();
    navigate('/');
  };

  const handleAdd = async () => {
    if (!newAddress.trim()) return;
    setAdding(true);
    setAddError('');
    const info = await addServer(newAddress);
    setAdding(false);
    if (info) {
      setNewAddress('');
    } else {
      setAddError('无法连接到该服务器');
    }
  };

  if (!isModalOpen) return null;

  return (
    <AnimatePresence>
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 glass-modal-backdrop"
            onClick={closeModal}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-[460px] glass-panel"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Server size={18} /> 选择服务器
              </div>
              <button onClick={closeModal} className="p-1 text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            {/* Server list */}
            <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto p-4">
              {servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isSelected={server.id === currentServerId}
                  onSelect={() => handleSelect(server.id)}
                  onRemove={server.isDefault ? undefined : () => removeServer(server.id)}
                  info={serverInfoMap[server.id] ?? null}
                  latency={latencyMap[server.id]}
                />
              ))}
            </div>

            {/* Add custom server */}
            <div className="border-t border-white/5 px-4 pb-4 pt-3">
              <div className="flex gap-2">
                <input
                  value={newAddress}
                  onChange={(e) => { setNewAddress(e.target.value); setAddError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="输入服务器地址  如 uno.example.com"
                  className="flex-1 glass-input px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-gradient-to-br from-[#fbbf24] to-[#f59e0b] px-3.5 py-2 text-[13px] font-bold text-[#1a1a2e] transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  <Plus size={14} /> {adding ? '添加中...' : '添加'}
                </button>
              </div>
              {addError && (
                <p className="mt-1.5 text-xs text-destructive">{addError}</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
