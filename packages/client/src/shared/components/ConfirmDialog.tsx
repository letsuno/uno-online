import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '@/shared/components/ui/Modal';
import { Button } from '@/shared/components/ui/Button';
import { useConfirmStore } from '../stores/confirm-store';

/**
 * Top-level mount for in-app confirm/alert dialogs. Reads from `confirm-store`
 * and renders at most one dialog at a time. Keyboard: Enter confirms, Esc
 * cancels (alerts treat both as confirm).
 */
export default function ConfirmDialog() {
  const current = useConfirmStore((s) => s.current);
  const resolve = useConfirmStore((s) => s.resolve);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolve(current.type === 'alert');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, resolve]);

  return (
    <Modal
      open={!!current}
      onClose={() => current && resolve(current.type === 'alert')}
      title={
        current && (
          <>
            {current.variant === 'danger' && (
              <AlertTriangle size={20} className="shrink-0 text-destructive" />
            )}
            {current.title}
          </>
        )
      }
      footer={
        current && (
          <div className="flex items-center justify-end gap-2">
            {current.type === 'confirm' && (
              <Button variant="secondary" onClick={() => resolve(false)}>
                {current.cancelText}
              </Button>
            )}
            <Button
              variant={current.variant === 'danger' ? 'danger' : 'primary'}
              onClick={() => resolve(true)}
              autoFocus
            >
              {current.confirmText}
            </Button>
          </div>
        )
      }
    >
      {current?.message && (
        <p className="text-sm text-foreground/80 whitespace-pre-line">{current.message}</p>
      )}
    </Modal>
  );
}
