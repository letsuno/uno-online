import { X, Upload, Check, Loader2 } from 'lucide-react';
import { useSettingsStore, type CardTheme } from '@/shared/stores/settings-store';
import { isPackLoaded } from '@/shared/utils/card-images';
import { IconButton } from '@/shared/components/ui/IconButton';
import { cn } from '@/shared/lib/utils';

const THEME_OPTIONS: { key: Exclude<CardTheme, 'custom'>; name: string; desc: string; preview: string | null }[] = [
  { key: 'default', name: '默认', desc: '经典手绘风', preview: null },
  { key: 'retro', name: '复古经典', desc: '彩底白椭圆', preview: '/card-themes/retro-preview.svg' },
  { key: 'minimal', name: '极简扁平', desc: '纯色大数字', preview: '/card-themes/minimal-preview.svg' },
  { key: 'neon', name: '霓虹暗黑', desc: '深底辉光', preview: '/card-themes/neon-preview.svg' },
];

interface CardThemeModalProps {
  open: boolean;
  onClose: () => void;
}

/** 卡面主题选择器：4 套内置主题 + 自定义资源包上传（上传仅桌面端展示） */
export default function CardThemeModal({ open, onClose }: CardThemeModalProps) {
  const cardTheme = useSettingsStore(s => s.cardTheme);
  const cardThemeReady = useSettingsStore(s => s.cardThemeReady);
  const setCardTheme = useSettingsStore(s => s.setCardTheme);

  if (!open) return null;

  const loading = cardTheme !== 'default' && !cardThemeReady && cardTheme !== 'custom';

  return (
    <div className="fixed inset-0 glass-modal-backdrop flex items-center justify-center z-modal" onClick={onClose}>
      <div className="glass-panel w-[420px] max-w-[92vw] px-6 py-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-game text-lg text-foreground">卡面主题</h2>
          <IconButton onClick={onClose} title="关闭">
            <X size={18} />
          </IconButton>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {THEME_OPTIONS.map(t => {
            const selected = cardTheme === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  void setCardTheme(t.key);
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl p-2.5 bg-white/5 cursor-pointer transition-all border-2',
                  selected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-white/10',
                )}
              >
                <div className="relative w-[52px] h-[78px]">
                  {t.preview ? (
                    <img src={t.preview} alt={t.name} className="w-full h-full rounded-md" draggable={false} />
                  ) : (
                    <div className="w-full h-full rounded-md bg-uno-red border-2 border-white flex items-center justify-center font-game font-black text-2xl text-white text-shadow-card shadow-card">
                      7
                    </div>
                  )}
                  {selected && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                      {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                    </span>
                  )}
                </div>
                <span className="text-xs text-foreground font-game">{t.name}</span>
                <span className="text-2xs text-muted-foreground leading-none">{t.desc}</span>
              </button>
            );
          })}
        </div>

        {/* 自定义资源包（文件选择器在触屏上不实用，移动端隐藏） */}
        <label
          className={cn(
            'mt-3 max-sm:hidden flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 bg-white/5 cursor-pointer transition-all border-2',
            cardTheme === 'custom' ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-white/10',
          )}
        >
          <Upload size={18} className="text-muted-foreground shrink-0" />
          <span className="flex flex-col min-w-0">
            <span className="text-sm text-foreground font-game">
              自定义资源包
              {cardTheme === 'custom' && isPackLoaded() && (
                <Check size={13} strokeWidth={3} className="inline ml-1.5 align-middle text-primary" />
              )}
            </span>
            <span className="text-2xs text-muted-foreground">上传 ZIP（0-53 编号的 webp/png/svg），仅本次会话有效</span>
          </span>
          <input
            type="file"
            accept=".zip"
            hidden
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) void setCardTheme('custom', file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
