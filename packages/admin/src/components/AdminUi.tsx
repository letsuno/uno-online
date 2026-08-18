import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4">
      <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

interface PanelProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Panel({ title, description, action, children, className = '', contentClassName = '' }: PanelProps) {
  return (
    <section className={`admin-panel ${className}`}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-medium text-slate-100">{title}</h2>}
            {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

interface AvatarProps {
  src: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const avatarSizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };

export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const className = `${avatarSizes[size]} shrink-0 rounded object-cover ring-1 ring-slate-700`;
  if (src) return <img src={src} alt="" className={className} />;
  return (
    <div className={`${className} grid place-items-center bg-slate-700 font-medium text-white`}>
      {name.trim().slice(0, 1).toUpperCase() || '?'}
    </div>
  );
}

export function AlertBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
      {children}
    </div>
  );
}

export function LoadingState({ label = '正在读取数据…' }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-slate-400">{label}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="grid min-h-48 place-items-center px-6 text-center">
      <div>
        <p className="font-medium text-slate-300">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
    </div>
  );
}
