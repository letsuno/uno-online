import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getSocket } from '../socket.js';

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
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: 100, right: 12, width: 40, height: 40, borderRadius: '50%',
        background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.2)',
        color: 'var(--text-primary)', fontSize: 18, cursor: 'pointer', zIndex: 50,
      }}>
        <MessageCircle size={18} />
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 100, right: 12, width: 280, height: 320,
      background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)',
      display: 'flex', flexDirection: 'column', zIndex: 50, overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>聊天</span>
        <button onClick={() => setOpen(false)} style={{ background: 'none', color: 'var(--text-secondary)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, fontSize: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <span style={{ color: 'var(--text-accent)', fontWeight: 'bold' }}>{m.username}: </span>
            <span>{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: 'flex', gap: 2, padding: '2px 6px', flexWrap: 'wrap' }}>
        {['👍', '😂', '😭', '🎉', '💪', '😱', '🤔', '❤️'].map((emoji) => (
          <button key={emoji} onClick={() => { getSocket().emit('chat:message', { text: emoji }); }}
            style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '2px' }}>
            {emoji}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', padding: 6, gap: 4 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="发送消息..." style={{
            flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)',
            background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12,
          }} />
        <button onClick={send} className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>发送</button>
      </div>
    </div>
  );
}
