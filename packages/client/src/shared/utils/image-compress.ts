import type { Area } from 'react-easy-crop';

const TARGET_SIZE = 256;

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

export function cropAndCompress(img: HTMLImageElement, croppedArea: Area): string {
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_SIZE;
  canvas.height = TARGET_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    img,
    croppedArea.x, croppedArea.y, croppedArea.width, croppedArea.height,
    0, 0, TARGET_SIZE, TARGET_SIZE,
  );
  return canvas.toDataURL('image/png');
}

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const area: Area = { x: sx, y: sy, width: size, height: size };
      resolve(cropAndCompress(img, area));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
