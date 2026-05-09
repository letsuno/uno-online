import { create } from 'zustand';
import type { ServerInfo } from '@uno-online/shared';

export interface ServerEntry {
  id: string;
  name: string;
  address: string;
  isDefault: boolean;
}

const DEFAULT_SERVER: ServerEntry = {
  id: 'default',
  name: '当前服务器',
  address: '',
  isDefault: true,
};

function loadCustomServers(): ServerEntry[] {
  try {
    const raw = localStorage.getItem('uno-server-list');
    return raw ? JSON.parse(raw) as ServerEntry[] : [];
  } catch {
    return [];
  }
}

function saveCustomServers(servers: ServerEntry[]) {
  const custom = servers.filter(s => !s.isDefault);
  localStorage.setItem('uno-server-list', JSON.stringify(custom));
}

function saveCurrentServerId(id: string) {
  const servers = [DEFAULT_SERVER, ...loadCustomServers()];
  const server = servers.find(s => s.id === id);
  if (server) {
    localStorage.setItem('uno-current-server', id);
    localStorage.setItem('uno-current-server-address', server.address);
  }
}

function buildServerUrl(address: string): string {
  if (!address) return '';
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${protocol}://${address}`;
}

async function fetchServerInfo(address: string): Promise<ServerInfo | null> {
  const base = buildServerUrl(address);
  try {
    const res = await fetch(`${base}/api/server/info`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as ServerInfo;
  } catch {
    return null;
  }
}

async function measureLatency(address: string): Promise<number | null> {
  const base = buildServerUrl(address);
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${base}/api/server/info`, { cache: 'no-store' });
      if (!res.ok) return null;
      times.push(performance.now() - start);
    } catch {
      return null;
    }
  }
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

interface ServerState {
  servers: ServerEntry[];
  currentServerId: string;
  serverInfoMap: Record<string, ServerInfo | null>;
  latencyMap: Record<string, number | null>;
  isModalOpen: boolean;

  addServer: (address: string) => Promise<ServerInfo | null>;
  removeServer: (id: string) => void;
  selectServer: (id: string) => void;
  refreshServerInfo: (id: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [DEFAULT_SERVER, ...loadCustomServers()],
  currentServerId: localStorage.getItem('uno-current-server') ?? 'default',
  serverInfoMap: {},
  latencyMap: {},
  isModalOpen: false,

  addServer: async (address: string) => {
    const trimmed = address.trim().replace(/\/+$/, '');
    if (!trimmed) return null;
    const { servers } = get();
    if (servers.some(s => s.address === trimmed)) return null;

    const info = await fetchServerInfo(trimmed);
    if (!info) return null;

    const entry: ServerEntry = {
      id: `custom_${Date.now()}`,
      name: info.name,
      address: trimmed,
      isDefault: false,
    };
    const updated = [...servers, entry];
    set({ servers: updated, serverInfoMap: { ...get().serverInfoMap, [entry.id]: info } });
    saveCustomServers(updated);
    return info;
  },

  removeServer: (id: string) => {
    const { servers, currentServerId } = get();
    const target = servers.find(s => s.id === id);
    if (!target || target.isDefault) return;
    const updated = servers.filter(s => s.id !== id);
    set({ servers: updated });
    saveCustomServers(updated);
    if (currentServerId === id) {
      set({ currentServerId: 'default' });
      saveCurrentServerId('default');
    }
  },

  selectServer: (id: string) => {
    set({ currentServerId: id });
    saveCurrentServerId(id);
  },

  refreshServerInfo: async (id: string) => {
    const { servers } = get();
    const server = servers.find(s => s.id === id);
    if (!server) return;

    const [info, latency] = await Promise.all([
      fetchServerInfo(server.address),
      measureLatency(server.address),
    ]);

    set({
      serverInfoMap: { ...get().serverInfoMap, [id]: info },
      latencyMap: { ...get().latencyMap, [id]: latency },
    });
  },

  refreshAll: async () => {
    const { servers } = get();
    await Promise.all(servers.map(s => get().refreshServerInfo(s.id)));
  },

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
