interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-lg">
        <div className="flex flex-col space-y-1.5">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description && <p className="text-sm text-slate-400">{description}</p>}
        </div>
        {children}
        <div className="flex justify-end gap-2 mt-4">{footer}</div>
      </div>
    </>
  );
}
