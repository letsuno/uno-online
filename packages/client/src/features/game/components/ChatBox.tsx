import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getSocket } from '@/shared/socket';
import { useToastStore } from '@/shared/stores/toast-store';
import { getRoleColor } from '@/shared/lib/utils';
import { AiBadge } from '@/shared/components/ui/AiBadge';
import { useChatStore } from '../stores/chat-store';
import { useGameStore } from '../stores/game-store';

const QUICK_PHRASES = ['嘻嘻😜', '嘿嘿😏', '哈哈😂', '饶命🙏', '稳了💪', '完蛋😱', '好牌!👍', '等等✋'];

interface ChatBoxProps {
  embedded?: boolean;
}

export default function ChatBox({ embedded = false }: ChatBoxProps) {
  const messages = useChatStore((s) => s.messages);
  const players = useGameStore((s) => s.players);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (embedded) inputRef.current?.focus();
  }, [embedded]);

  useEffect(() => {
    const socket = getSocket();
    const rateLimitHandler = (data: { message: string }) => {
      useToastStore.getState().addToast(data.message, 'error');
    };
    socket.on('chat:rate_limited', rateLimitHandler);

    return () => {
      socket.off('chat:rate_limited', rateLimitHandler);
    };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    getSocket().emit('chat:message', { text: input.trim() });
    setInput('');
  };

  const sendPhrase = (text: string) => {
    getSocket().emit('chat:message', { text });
  };

  if (embedded) {
    return (
      <div className="w-full flex flex-col gap-2 select-text" data-allow-selection>
        <div className="max-h-48 overflow-y-auto text-xs">
          {messages.map((m) => (
            <div key={m.id} className="mb-1">
              <span className="font-bold" style={{ color: getRoleColor(m.role) || 'var(--accent)' }}>{m.nickname}{players.find(p => p.id === m.userId)?.isBot && <AiBadge className="mx-0.5" />}: </span>
              <span>{m.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {['👍', '😂', '😭', '🎉', '💪', '😱', '🤔', '❤️'].map((emoji) => (
            <button key={emoji} onClick={() => sendPhrase(emoji)}
              className="bg-transparent border-none text-sm cursor-pointer p-0.5">
              {emoji}
            </button>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          {QUICK_PHRASES.map((phrase) => (
            <button key={phrase} onClick={() => sendPhrase(phrase)}
              className="bg-white/10 rounded-lg text-2xs px-2 py-0.5 text-foreground cursor-pointer transition-colors duration-150 hover:bg-white/20">
              {phrase}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="发送消息..."
            className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/20 bg-muted text-foreground text-xs"
          />
          <button onClick={send} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-3xl text-xs font-bold">发送</button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex fixed bottom-chat-bottom right-3 w-10 h-10 rounded-full bg-black/30 border border-white/20 text-foreground text-lg cursor-pointer z-fab items-center justify-center"
      >
        <MessageCircle size={18} />
      </button>
    );
  }

  return (
    <div className="hidden md:flex fixed bottom-chat-bottom right-3 w-chat-w h-chat-h bg-card rounded-xl border border-white/15 flex-col z-fab overflow-hidden select-text" data-allow-selection>
      <div className="px-3 py-2 bg-muted flex justify-between items-center">
        <span className="text-caption font-bold">聊天</span>
        <button onClick={() => setOpen(false)} className="bg-transparent text-muted-foreground text-base cursor-pointer flex items-center border-none">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {messages.map((m) => (
          <div key={m.id} className="mb-1">
            <span className="text-accent font-bold">{m.nickname}{players.find(p => p.id === m.userId)?.isBot && <AiBadge className="mx-0.5" />}: </span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-0.5 px-1.5 py-0.5 flex-wrap">
        {['👍', '😂', '😭', '🎉', '💪', '😱', '🤔', '❤️'].map((emoji) => (
          <button key={emoji} onClick={() => sendPhrase(emoji)}
            className="bg-transparent border-none text-sm cursor-pointer p-0.5">
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex gap-1 px-1.5 py-0.5 flex-wrap">
        {QUICK_PHRASES.map((phrase) => (
          <button key={phrase} onClick={() => sendPhrase(phrase)}
            className="bg-white/10 rounded-lg text-2xs px-2 py-0.5 text-foreground cursor-pointer transition-colors duration-150 hover:bg-white/20">
            {phrase}
          </button>
        ))}
      </div>
      <div className="flex p-1.5 gap-1">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="发送消息..."
          className="flex-1 px-2.5 py-1.5 rounded-lg border border-white/20 bg-muted text-foreground text-xs"
        />
        <button onClick={send} className="bg-primary text-primary-foreground px-3 py-1.5 rounded-3xl text-xs font-bold">发送</button>
      </div>
    </div>
  );
}
