import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { compressImage } from '../utils/image-compress';

interface AvatarUploadProps {
  avatarUrl: string | null;
  size?: number;
  onUpload: (dataUrl: string) => void;
}

export default function AvatarUpload({ avatarUrl, size = 80, onUpload }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      onUpload(dataUrl);
    } catch {
      // ignore
    }
    e.target.value = '';
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      style={{
        width: size, height: size, borderRadius: '50%', cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        background: 'var(--bg-surface)', border: '2px solid rgba(255,255,255,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Camera size={size * 0.4} style={{ color: 'var(--text-secondary)' }} />
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,0.5)', color: '#fff',
        fontSize: 10, textAlign: 'center', padding: '2px 0',
      }}>
        更换
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} />
    </div>
  );
}
