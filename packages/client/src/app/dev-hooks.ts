// 仅开发环境：把 socket 与 stores 暴露到 window.__uno，供 e2e 脚本驱动
import { getSocket } from '@/shared/socket';
import { useGameStore } from '@/features/game/stores/game-store';
import { useRoomStore } from '@/shared/stores/room-store';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useProfileModalStore } from '@/shared/stores/profile-modal-store';

declare global {
  interface Window {
    __uno?: {
      getSocket: typeof getSocket;
      useGameStore: typeof useGameStore;
      useRoomStore: typeof useRoomStore;
      useAuthStore: typeof useAuthStore;
      useProfileModalStore: typeof useProfileModalStore;
    };
  }
}

// 开发环境默认暴露 socket 与 stores 到 window.__uno，供 e2e 脚本驱动；
// 生产构建下仅在 localStorage.uno-e2e=1 时暴露（e2e 验证生产包用，正常用户无影响）
if (import.meta.env.DEV || localStorage.getItem('uno-e2e') === '1') {
  window.__uno = { getSocket, useGameStore, useRoomStore, useAuthStore, useProfileModalStore };
}
