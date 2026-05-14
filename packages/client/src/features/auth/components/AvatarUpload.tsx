import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { compressImage } from '@/shared/utils/image-compress';

interface Props {
  avatarUrl: string | null;
  size?: number;
  onUpload: (dataUrl: string) => void;
}

/**
 * 圆形头像上传组件。Tailwind 风格，与项目其他组件视觉一致。
 *
 * - 默认：边框灰、中央相机图标
 * - 已有头像：填充 img
 * - hover：scale-up + 边框变 amber + 半透明 "更换头像" 遮罩
 * - 上传中：spinner overlay + 禁用点击
 */
export default function AvatarUpload({ avatarUrl, size = 96, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      onUpload(dataUrl);
    } catch {
      // ignore；上层调用方决定是否要 toast
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative w-full h-full rounded-full overflow-hidden border-2 border-white/15 bg-white/5 transition-all duration-200 hover:scale-[1.04] hover:border-primary/60 hover:shadow-[0_0_32px_rgba(251,191,36,0.25)] disabled:opacity-60 disabled:cursor-wait"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Camera size={size * 0.36} className="text-muted-foreground" />
          </div>
        )}

        {/* hover 遮罩 */}
        {!uploading && (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <span className="text-white text-xs tracking-wider">更换头像</span>
          </div>
        )}

        {/* 上传中 spinner */}
        {uploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 size={size * 0.32} className="text-primary animate-spin" />
          </div>
        )}
      </button>

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} />
    </div>
  );
}
