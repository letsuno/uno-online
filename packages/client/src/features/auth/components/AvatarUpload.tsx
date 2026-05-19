import { useRef, useState, useCallback } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { loadImage, cropAndCompress } from '@/shared/utils/image-compress';
import { Button } from '@/shared/components/ui/Button';

interface Props {
  avatarUrl: string | null;
  size?: number;
  onUpload: (dataUrl: string) => void;
}

export default function AvatarUpload({ avatarUrl, size = 96, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedArea(croppedPixels);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const img = await loadImage(file);
      setImageEl(img);
      setImageSrc(img.src);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    } catch {
      // ignore
    }
  };

  const handleConfirm = () => {
    if (!imageEl || !croppedArea) return;
    setUploading(true);
    try {
      const dataUrl = cropAndCompress(imageEl, croppedArea);
      onUpload(dataUrl);
    } finally {
      setUploading(false);
      setImageSrc(null);
      setImageEl(null);
    }
  };

  const handleCancel = () => {
    setImageSrc(null);
    setImageEl(null);
  };

  return (
    <>
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
          {!uploading && (
            <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <span className="text-white text-xs tracking-wider">更换头像</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <Loader2 size={size * 0.32} className="text-primary animate-spin" />
            </div>
          )}
        </button>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFileSelect} />
      </div>

      {imageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="glass-panel flex flex-col w-80 rounded-2xl overflow-hidden">
            <div className="relative w-full h-72">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex flex-col gap-3 p-4">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={handleCancel} sound="click">
                  取消
                </Button>
                <Button type="button" variant="game" className="flex-1" onClick={handleConfirm} sound="click">
                  确认
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
