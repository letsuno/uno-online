import BottomSheet from '../BottomSheet';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';

const EMOJIS = ['👍', '😂', '😭', '🎉', '💪', '😱'];
const THROW_ITEMS = [
  { emoji: '🥚', label: '鸡蛋' },
  { emoji: '🍅', label: '番茄' },
  { emoji: '🌹', label: '玫瑰' },
  { emoji: '💩', label: '便便' },
  { emoji: '👍', label: '点赞' },
  { emoji: '💖', label: '爱心' },
];

interface OpponentSheetProps {
  target: { id: string; name: string } | null;
  onClose: () => void;
}

/** 点击对手后的互动面板：快捷表情（全房间可见）+ 投掷道具（飞向该玩家） */
export default function OpponentSheet({ target, onClose }: OpponentSheetProps) {
  if (!target) return null;

  const sendReaction = (emoji: string) => {
    getSocket().emit('chat:message', { text: emoji });
    onClose();
  };

  const throwItem = (item: string) => {
    getSocket().emit('throw:item', { targetId: target.id, item }, (res: { success: boolean; error?: string }) => {
      if (!res?.success && res?.error) {
        useToastStore.getState().addToast(res.error, 'error');
      }
    });
    onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={`对 ${target.name} 互动`}>
      <div className="px-4 py-3 flex flex-col gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-2">快捷表情</div>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendReaction(emoji)}
                className="h-12 rounded-xl bg-secondary border border-border text-2xl flex items-center justify-center cursor-pointer transition-all active:scale-90 active:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-2">投掷道具</div>
          <div className="grid grid-cols-4 gap-2">
            {THROW_ITEMS.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => throwItem(emoji)}
                className="h-14 rounded-xl bg-secondary border border-border flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all active:scale-90 active:bg-white/10"
              >
                <span className="text-2xl">{emoji}</span>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
