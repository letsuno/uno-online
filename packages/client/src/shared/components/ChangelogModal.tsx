import { useState, useEffect, useCallback } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { changelog } from '../data/changelog';
import { useAuthStore } from '@/features/auth/stores/auth-store';

const STORAGE_KEY = 'app-last-seen-version';
const VISIBLE_COUNT = 3;

let externalOpen: (() => void) | null = null;
export function openChangelog() { externalOpen?.(); }

export default function ChangelogModal() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const token = useAuthStore((s) => s.token);

  const show = useCallback(() => setOpen(true), []);
  useEffect(() => { externalOpen = show; return () => { externalOpen = null; }; }, [show]);

  useEffect(() => {
    if (!token) return;
    const currentVersion = import.meta.env.BUILD_VERSION as string;
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (lastSeen !== currentVersion) {
      setOpen(true);
    }
  }, [token]);

  const close = () => {
    setOpen(false);
    setExpanded(false);
    localStorage.setItem(STORAGE_KEY, import.meta.env.BUILD_VERSION as string);
  };

  const hasMore = changelog.length > VISIBLE_COUNT;
  const visibleEntries = expanded ? changelog : changelog.slice(0, VISIBLE_COUNT);

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        <>
          <Sparkles size={18} className="text-accent" /> 更新日志
        </>
      }
      footer={
        <Button variant="primary" className="w-full" onClick={close}>
          知道了
        </Button>
      }
    >
      {visibleEntries.map((entry) => (
        <div key={entry.version} className="mb-5 last:mb-0">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-base font-bold text-accent">v{entry.version}</span>
            <span className="text-xs text-muted-foreground">{entry.date}</span>
          </div>
          <ul className="space-y-1.5">
            {entry.changes.map((change, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/90">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {change}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-white/10 py-2 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground"
        >
          查看更早的 {changelog.length - VISIBLE_COUNT} 个版本
          <ChevronDown size={14} />
        </button>
      )}
    </Modal>
  );
}
