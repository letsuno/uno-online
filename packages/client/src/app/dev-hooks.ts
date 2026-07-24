// 仅开发环境：把 socket 与 stores 暴露到 window.__uno，供 e2e 脚本驱动
import { getSocket } from '@/shared/socket';
import { useGameStore } from '@/features/game/stores/game-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';

declare global {
  interface Window {
    __uno?: {
      getSocket: typeof getSocket;
      useGameStore: typeof useGameStore;
      useRoomStore: typeof useRoomStore;
      useAuthStore: typeof useAuthStore;
    };
  }
}

if (import.meta.env.DEV) {
  window.__uno = { getSocket, useGameStore, useRoomStore, useAuthStore };
}
