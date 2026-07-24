import { cn } from '@/shared/lib/utils';

interface Tab<T extends string> {
  key: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: readonly Tab<T>[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}

/** 统一下划线 Tab（信息抽屉、弹窗内分组等） */
export function Tabs<T extends string>({ tabs, active, onChange, className }: TabsProps<T>) {
  return (
    <div className={cn('flex border-b border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-3.5 py-2 text-sm cursor-pointer transition-colors bg-transparent border-0',
            active === tab.key
              ? 'text-primary font-bold border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
