import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Users, Home, Clock, Signal, Plus, Trash2 } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { cn } from '@/shared/lib/utils';
import { useServerStore } from '../stores/server-store';
import type { ServerEntry } from '../stores/server-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { getPingColor } from '../lib/ping';

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
  info: {
    name: string;
    version: string;
    motd: string;
    onlinePlayers: number;
    activeRooms: number;
    uptime: number;
  } | null;
  latency: number | null | undefined;
}) {
  const isOnline = info !== null;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-xl border p-3.5 transition-colors',
        isSelected ? 'border-primary/30 bg-primary/[0.08]' : 'border-white/10 bg-white/[0.04]',
        !isOnline && 'opacity-50',
      )}
    >
      {/* Header row */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 shrink-0 rounded-full',
              isOnline ? 'bg-uno-green' : 'bg-destructive',
            )}
          />
          <span className="text-[15px] font-bold text-foreground">{info?.name ?? server.name}</span>
          {info && <span className="text-xs text-muted-foreground">v{info.version}</span>}
        </div>
        <div className="flex items-center gap-2">
          {!isOnline && !server.isDefault && <span className="text-xs text-muted-foreground">离线</span>}
          {!server.isDefault && onRemove && (
            <button
              onClick={e => {
                e.stopPropagation();
                onRemove();
              }}
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
        <p className="text-[13px] text-muted-foreground">{server.address || '当前部署'}</p>
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
          <span className="flex items-center gap-1 font-medium" style={{ color: getPingColor(latency).text }}>
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
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const [newAddress, setNewAddress] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (isModalOpen) {
      void refreshAll();
    }
  }, [isModalOpen]);

  const handleSelect = async (id: string) => {
    if (id === currentServerId) return;
    await logout();
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

  return (
    <Modal
      open={isModalOpen}
      onClose={closeModal}
      width={460}
      title={
        <>
          <Server size={18} /> 选择服务器
        </>
      }
      footer={
        <div>
          <div className="flex gap-2">
            <Input
              inputSize="sm"
              className="flex-1"
              value={newAddress}
              onChange={e => {
                setNewAddress(e.target.value);
                setAddError('');
              }}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="输入服务器地址  如 uno.example.com"
            />
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={adding} className="whitespace-nowrap">
              <Plus size={14} /> {adding ? '添加中...' : '添加'}
            </Button>
          </div>
          {addError && <p className="mt-1.5 text-xs text-destructive">{addError}</p>}
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {servers.map(server => (
          <ServerCard
            key={server.id}
            server={server}
            isSelected={server.id === currentServerId}
            onSelect={() => {
              void handleSelect(server.id);
            }}
            onRemove={server.isDefault ? undefined : () => removeServer(server.id)}
            info={serverInfoMap[server.id] ?? null}
            latency={latencyMap[server.id]}
          />
        ))}
      </div>
    </Modal>
  );
}
