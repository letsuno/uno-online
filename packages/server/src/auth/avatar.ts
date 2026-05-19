import sharp from 'sharp';

const TARGET_SIZE = 256;
const WEBP_QUALITY = 80;
const MAX_INPUT_LENGTH = 10 * 1024 * 1024;

export async function processAvatar(dataUrl: string): Promise<string> {
  if (dataUrl.length > MAX_INPUT_LENGTH) {
    throw new AvatarError('头像数据过大');
  }

  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match?.[1]) {
    throw new AvatarError('头像格式无效');
  }

  const buffer = Buffer.from(match[1], 'base64');

  let output: Buffer;
  try {
    output = await sharp(buffer, { animated: false })
      .resize(TARGET_SIZE, TARGET_SIZE, { fit: 'cover' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw new AvatarError('头像图片无法解析');
  }

  return `data:image/webp;base64,${output.toString('base64')}`;
}

export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarError';
  }
}
