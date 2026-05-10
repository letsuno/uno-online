import { create } from 'zustand';
import type { ChatMessage } from '@uno-online/shared';

interface ChatState {
  messages: ChatMessage[];
  latestLiveMessage: ChatMessage | null;
  setHistory: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  latestLiveMessage: null,
  setHistory: (messages) => set({ messages: messages.slice(-200), latestLiveMessage: null }),
  addMessage: (message) =>
    set((state) => {
      if (state.messages.some((m) => m.id === message.id)) return state;
      return { messages: [...state.messages, message].slice(-200), latestLiveMessage: message };
    }),
  clearMessages: () => set({ messages: [], latestLiveMessage: null }),
}));
