import type { BotDifficulty } from '@uno-online/shared';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';

export function useBotManagement() {
  const addToast = useToastStore((s) => s.addToast);

  const addBot = (difficulty: BotDifficulty) => {
    getSocket().emit('room:add_bot', { difficulty }, (res) => {
      if (!res.success) {
        addToast(res.error ?? '添加人机失败', 'error');
      }
    });
  };

  const removeBot = (botId: string) => {
    getSocket().emit('room:remove_bot', { botId }, (res) => {
      if (!res.success) {
        addToast(res.error ?? '移除人机失败', 'error');
      }
    });
  };

  const setBotDifficulty = (botId: string, difficulty: BotDifficulty) => {
    getSocket().emit('room:set_bot_difficulty', { botId, difficulty }, (res) => {
      if (!res.success) {
        addToast(res.error ?? '调整难度失败', 'error');
      }
    });
  };

  return { addBot, removeBot, setBotDifficulty };
}
