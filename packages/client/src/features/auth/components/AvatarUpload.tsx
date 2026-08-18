import { useRef, useState, useCallback } from 'react';
import { Camera, Loader2, RotateCw } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { loadImage, cropAndCompress, revokeImageSrc } from '@/shared/utils/image-compress';
import { Button } from '@/shared/components/ui/Button';
import { IconButton } from '@/shared/components/ui/IconButton';
import Modal from '@/shared/components/ui/Modal';
import { useToastStore } from '@/shared/stores/toast-store';

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
  const [rotation, setRotation] = useState(0);
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
      setRotation(0);
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : '图片读取失败', 'error');
    }
  };

  const cleanup = () => {
    if (imageEl) revokeImageSrc(imageEl);
    setImageSrc(null);
    setImageEl(null);
  };

  const handleConfirm = () => {
    if (!imageEl || !croppedArea) return;
    setUploading(true);
    try {
      const dataUrl = cropAndCompress(imageEl, croppedArea, rotation);
      onUpload(dataUrl);
    } catch (error) {
      useToastStore.getState().addToast(error instanceof Error ? error.message : '头像处理失败', 'error');
    } finally {
      setUploading(false);
      cleanup();
    }
  };

  const handleCancel = () => {
    cleanup();
  };

  return (
    <>
      <div className="relative" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="group relative w-full h-full rounded-full overflow-hidden border-2 border-white/15 bg-white/5 transition-all duration-200 hover:scale-[1.04] hover:border-primary/60 hover:shadow-glow-active disabled:opacity-60 disabled:cursor-wait"
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

      <Modal open={!!imageSrc} onClose={handleCancel} width={320} title="裁切头像">
        <div className="relative w-full h-72">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="flex flex-col gap-3 pt-4">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={e => setRotation(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="shrink-0 w-9 text-right text-xs tabular-nums text-muted-foreground">{rotation}°</span>
            <IconButton type="button" size="sm" onClick={() => setRotation(r => (r + 90) % 360)} title="旋转 90°">
              <RotateCw size={16} />
            </IconButton>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={handleCancel} sound="click">
              取消
            </Button>
            <Button type="button" variant="game" className="flex-1" onClick={handleConfirm} sound="click">
              确认
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
