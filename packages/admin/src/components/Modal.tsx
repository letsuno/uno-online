import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer: ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-black/75"
        onClick={onClose}
        aria-label="关闭对话框"
      />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded text-xl leading-none text-slate-500 hover:bg-slate-800 hover:text-white"
          aria-label="关闭"
        >
          ×
        </button>
        <div className="pr-8">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && <p className="mt-1.5 text-sm leading-6 text-slate-400">{description}</p>}
        </div>
        {children}
        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">{footer}</div>
      </div>
    </div>
  );
}
