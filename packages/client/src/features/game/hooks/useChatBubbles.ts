import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chat-store';

export function useChatBubbles() {
  const [chatMessages, setChatMessages] = useState<Map<string, string>>(new Map());
  const chatTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const latestChatMessage = useChatStore((s) => s.latestLiveMessage);

  useEffect(() => {
    if (!latestChatMessage) {
      setChatMessages(new Map());
      chatTimers.current.forEach((t) => clearTimeout(t));
      chatTimers.current.clear();
      return;
    }

    setChatMessages((prev) => {
      const next = new Map(prev);
      next.set(latestChatMessage.userId, latestChatMessage.text);
      return next;
    });

    const existing = chatTimers.current.get(latestChatMessage.userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setChatMessages((prev) => {
        const next = new Map(prev);
        next.delete(latestChatMessage.userId);
        return next;
      });
      chatTimers.current.delete(latestChatMessage.userId);
    }, 3000);
    chatTimers.current.set(latestChatMessage.userId, timer);
  }, [latestChatMessage]);

  useEffect(() => {
    return () => {
      chatTimers.current.forEach((t) => clearTimeout(t));
      chatTimers.current.clear();
    };
  }, []);

  return chatMessages;
}
