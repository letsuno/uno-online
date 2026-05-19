import { describe, it, expect } from 'vitest';
import { validatePassword, validateNickname, validateAvatar } from '../../src/auth/validation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('abc123').valid).toBe(false);
    expect(validatePassword('abc123').error).toBe('密码至少 8 个字符');
  });

  it('rejects passwords longer than 128 characters', () => {
    expect(validatePassword('a1' + 'x'.repeat(128)).valid).toBe(false);
  });

  it('rejects password without letters', () => {
    expect(validatePassword('12345678').valid).toBe(false);
    expect(validatePassword('12345678').error).toBe('密码必须包含字母');
  });

  it('rejects password without numbers', () => {
    expect(validatePassword('abcdefgh').valid).toBe(false);
    expect(validatePassword('abcdefgh').error).toBe('密码必须包含数字');
  });

  it('accepts valid password with letters and numbers', () => {
    expect(validatePassword('abc12345').valid).toBe(true);
  });

  it('accepts password with special characters', () => {
    expect(validatePassword('abc123!@').valid).toBe(true);
  });
});

describe('validateNickname', () => {
  it('rejects empty nickname', () => {
    expect(validateNickname('').valid).toBe(false);
  });

  it('rejects pure whitespace', () => {
    expect(validateNickname('   ').valid).toBe(false);
  });

  it('rejects nickname with only symbols/punctuation', () => {
    expect(validateNickname('...').valid).toBe(false);
    expect(validateNickname('!!!').error).toBe('昵称必须包含至少一个字母或数字');
  });

  it('accepts Chinese nickname', () => {
    expect(validateNickname('小明').valid).toBe(true);
  });

  it('accepts nickname with mixed content', () => {
    expect(validateNickname('玩家_01').valid).toBe(true);
  });

  it('accepts emoji with letters', () => {
    expect(validateNickname('player').valid).toBe(true);
  });

  it('rejects nickname longer than 20 characters', () => {
    expect(validateNickname('a'.repeat(21)).valid).toBe(false);
  });

  it('strips control characters before validation', () => {
    expect(validateNickname('​​abc').valid).toBe(true);
  });
});

describe('validateAvatar', () => {
  const validWebp = 'data:image/webp;base64,UklGR' + 'A'.repeat(20) + '=';
  const validJpeg = 'data:image/jpeg;base64,/9j/4AAQ' + 'B'.repeat(20) + '==';
  const validPng = 'data:image/png;base64,iVBOR' + 'C'.repeat(20) + '=';

  it('accepts valid webp data URL', () => {
    expect(validateAvatar(validWebp).valid).toBe(true);
  });

  it('accepts valid jpeg data URL', () => {
    expect(validateAvatar(validJpeg).valid).toBe(true);
  });

  it('accepts valid png data URL', () => {
    expect(validateAvatar(validPng).valid).toBe(true);
  });

  it('rejects non-image MIME type', () => {
    expect(validateAvatar('data:text/html;base64,AAAA').valid).toBe(false);
    expect(validateAvatar('data:text/html;base64,AAAA').error).toBe('头像格式无效');
  });

  it('rejects missing data: prefix', () => {
    expect(validateAvatar('image/webp;base64,AAAA').valid).toBe(false);
  });

  it('rejects unsupported image type', () => {
    expect(validateAvatar('data:image/svg+xml;base64,AAAA').valid).toBe(false);
  });

  it('rejects invalid base64 characters', () => {
    expect(validateAvatar('data:image/webp;base64,!!!invalid!!!').valid).toBe(false);
  });

  it('rejects data URL without base64 encoding marker', () => {
    expect(validateAvatar('data:image/webp,raw-data-here').valid).toBe(false);
  });

  it('rejects avatar exceeding size limit', () => {
    const huge = 'data:image/webp;base64,' + 'A'.repeat(100_000);
    expect(validateAvatar(huge).valid).toBe(false);
    expect(validateAvatar(huge).error).toBe('头像数据过大');
  });
});
