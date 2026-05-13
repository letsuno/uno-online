import { create } from 'zustand';

interface ConfirmRequest {
  id: number;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  variant: 'default' | 'danger';
  type: 'confirm' | 'alert';
  resolve: (ok: boolean) => void;
}

interface ConfirmStore {
  current: ConfirmRequest | null;
  push: (req: ConfirmRequest) => void;
  resolve: (ok: boolean) => void;
}

let nextId = 1;

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  current: null,
  push: (req) => {
    // If another dialog is already open, cancel it before showing the new one.
    const prev = get().current;
    if (prev) prev.resolve(false);
    set({ current: req });
  },
  resolve: (ok) => {
    const cur = get().current;
    if (!cur) return;
    cur.resolve(ok);
    set({ current: null });
  },
}));

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
}

/**
 * Imperative replacement for `window.confirm`. Renders an in-app modal and
 * resolves to `true` if the user confirms, `false` if they cancel or close it.
 *
 * ```ts
 * if (!(await showConfirm({ title: '解散房间', message: '...', variant: 'danger' }))) return;
 * doDangerousThing();
 * ```
 */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().push({
      id: nextId++,
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? '确定',
      cancelText: opts.cancelText ?? '取消',
      variant: opts.variant ?? 'default',
      type: 'confirm',
      resolve,
    });
  });
}

/**
 * Imperative replacement for `window.alert`. Single button, resolves when the
 * user dismisses it.
 */
export function showAlert(opts: Omit<ConfirmOptions, 'cancelText' | 'variant'> & { variant?: 'default' | 'danger' }): Promise<void> {
  return new Promise((resolve) => {
    useConfirmStore.getState().push({
      id: nextId++,
      title: opts.title,
      message: opts.message,
      confirmText: opts.confirmText ?? '确定',
      cancelText: '',
      variant: opts.variant ?? 'default',
      type: 'alert',
      resolve: () => resolve(),
    });
  });
}
