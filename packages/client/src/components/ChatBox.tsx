import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getSocket } from '../socket';

interface ChatMessage { userId: string; username: string; text: string; timestamp: number; }

export default function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    const handler = (msg: ChatMessage) => { setMessages((prev) => [...prev.slice(-50), msg]); };
    socket.on('chat:message', handler);
    return () => { socket.off('chat:message', handler); };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    getSocket().emit('chat:message', { text: input.trim() });
    setInput('');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[100px] right-3 w-10 h-10 rounded-full bg-black/30 border border-white/20 text-foreground text-lg cursor-pointer z-50 flex items-center justify-center"
      >
        <MessageCircle size={18} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-[100px] right-3 w-[280px] h-[320px] bg-card rounded-xl border border-white/15 flex flex-col z-50 overflow-hidden">
      <div className="px-3 py-2 bg-muted flex justify-between items-center">
        <span className="text-[13px] font-bold">聊天</span>
        <button onClick={() => setOpen(false)} className="bg-transparent text-muted-foreground text-base cursor-pointer flex items-center border-none">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 text-xs">
        {messages.map((m, i) => (
          <div key={i} className="mb-1">
            <span className="text-accent font-bold">{m.username}: </span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-0.5 px-1.5 py-0.5 flex-wrap">
        {['👍', '😂', '😭', '🎉', '💪', '😱', '🤔', '❤️'].map((emoji) => (
          <button key={emoji} onClick={() => { getSocket().emit('chat:message', { text: emoji }); }}
            className="bg-transparent border-none text-sm cursor-pointer p-0.5">
            {emoji}
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
