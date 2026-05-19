import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processAvatar, AvatarError } from '../../src/auth/avatar';

async function makeTestImage(width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'gif' = 'png'): Promise<string> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .toFormat(format)
    .toBuffer();
  return `data:image/${format};base64,${buf.toString('base64')}`;
}

async function makeAnimatedGif(): Promise<string> {
  const frame1 = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const frame2 = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } } }).png().toBuffer();
  const gif = await sharp(frame1, { animated: true })
    .gif({ delay: [200, 200] })
    .composite([{ input: frame2, animated: true }])
    .toBuffer()
    .catch(() =>
      sharp(frame1).gif().toBuffer()
    );
  return `data:image/gif;base64,${gif.toString('base64')}`;
}

describe('processAvatar', () => {
  it('processes a valid PNG and returns a WebP data URL', async () => {
    const input = await makeTestImage(512, 512, 'png');
    const result = await processAvatar(input);
    expect(result).toMatch(/^data:image\/webp;base64,/);
  });

  it('processes a valid JPEG', async () => {
    const input = await makeTestImage(800, 600, 'jpeg');
    const result = await processAvatar(input);
    expect(result).toMatch(/^data:image\/webp;base64,/);
  });

  it('resizes output to 256x256', async () => {
    const input = await makeTestImage(1024, 768, 'png');
    const result = await processAvatar(input);
    const buf = Buffer.from(result.replace(/^data:image\/webp;base64,/, ''), 'base64');
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it('handles non-square images (cover crop)', async () => {
    const input = await makeTestImage(1000, 200, 'png');
    const result = await processAvatar(input);
    const buf = Buffer.from(result.replace(/^data:image\/webp;base64,/, ''), 'base64');
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  it('takes first frame from animated GIF', async () => {
    const input = await makeAnimatedGif();
    const result = await processAvatar(input);
    expect(result).toMatch(/^data:image\/webp;base64,/);
    const buf = Buffer.from(result.replace(/^data:image\/webp;base64,/, ''), 'base64');
    const meta = await sharp(buf).metadata();
    expect(meta.pages).toBeUndefined();
  });

  it('rejects non-image data URL', async () => {
    await expect(processAvatar('data:text/html;base64,AAAA')).rejects.toThrow(AvatarError);
    await expect(processAvatar('data:text/html;base64,AAAA')).rejects.toThrow('头像格式无效');
  });

  it('rejects malformed data URL', async () => {
    await expect(processAvatar('not-a-data-url')).rejects.toThrow(AvatarError);
  });

  it('rejects invalid image data', async () => {
    await expect(processAvatar('data:image/png;base64,bm90YW5pbWFnZQ==')).rejects.toThrow('头像图片无法解析');
  });

  it('rejects oversized input', async () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(10 * 1024 * 1024);
    await expect(processAvatar(huge)).rejects.toThrow('头像数据过大');
  });
});
