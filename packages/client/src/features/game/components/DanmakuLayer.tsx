import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../stores/chat-store';
import type { ChatMessage } from '@uno-online/shared';

interface DanmakuItem {
  id: string;
  message: ChatMessage;
  track: number;
}

const TRACK_COUNT = 5;
const DURATION = 8000;

export default function DanmakuLayer() {
  const latestMessage = useChatStore((s) => s.latestLiveMessage);
  const [items, setItems] = useState<DanmakuItem[]>([]);
  const nextTrackRef = useRef(0);

  useEffect(() => {
    if (!latestMessage) return;
    const track = nextTrackRef.current % TRACK_COUNT;
    nextTrackRef.current = track + 1;
    const item: DanmakuItem = { id: latestMessage.id, message: latestMessage, track };
    setItems((prev) => [...prev, item]);
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    }, DURATION);
    return () => clearTimeout(timer);
  }, [latestMessage]);

  if (items.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 15 }}>
      {items.map((item) => (
        <div
          key={item.id}
          className="danmaku-item absolute whitespace-nowrap text-sm font-bold"
          style={{
            top: `${item.track * 28 + 8}px`,
            textShadow: '1px 1px 2px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)',
          }}
        >
          {item.message.isSpectator && (
            <span className="text-2xs bg-white/20 rounded px-1 py-0.5 mr-1 align-middle">观众</span>
          )}
          <span className="text-white/60 mr-1">{item.message.nickname}</span>
          <span className="text-white">{item.message.text}</span>
        </div>
      ))}
    </div>
  );
}
